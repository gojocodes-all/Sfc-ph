import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE) throw new Error('Supabase environment is unavailable.');

const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = 'phx-media';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VOICE_BYTES = 8 * 1024 * 1024;
const enc = new TextEncoder();
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-owner-token',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400'
};

function json(payload: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const slugify = (value: unknown) => clean(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
const rid = (prefix = '') => prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 18);
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function pathOf(req: Request) { return new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?phx-api(?=\/|$)/, '') || '/'; }
function tokenFrom(req: Request, body?: Record<string,unknown>|null) { return clean(req.headers.get('x-owner-token') || body?.token || new URL(req.url).searchParams.get('token'), 160); }
function bearerFrom(req: Request) {
  const value = req.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}
async function authUser(req: Request) {
  const token = bearerFrom(req);
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function ensureProfile(user: any) {
  if (!user?.id) return;
  const displayName = clean(user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '', 50);
  const { error } = await sb.from('profiles').upsert({ user_id: user.id, display_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.error('Profile upsert failed:', error.message);
}
async function requireUser(req: Request) {
  const user = await authUser(req);
  if (!user) return { user: null, error: json({ error: 'Sign in required.' }, 401) };
  await ensureProfile(user);
  return { user, error: null };
}
async function requestKey(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();
  const ua = req.headers.get('user-agent') || 'unknown';
  return hash(`${SERVICE.slice(0, 20)}|${ip}|${ua}`);
}
function publicInbox(row: any) {
  return row ? { id: row.id, slug: row.slug, displayName: row.display_name, handle: row.handle, createdAt: row.created_at } : null;
}
async function getInboxBySlug(slug: string) {
  const { data, error } = await sb.from('inboxes').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}
async function ownerAllowed(inbox: any, req: Request, body?: Record<string,unknown>|null) {
  if (!inbox) return false;
  const user = await authUser(req);
  if (user?.id && inbox.owner_user_id === user.id) return true;
  const token = tokenFrom(req, body);
  return Boolean(token && inbox.owner_token_hash === await hash(token));
}
async function requireOwnedInbox(slug: string, req: Request, body?: Record<string,unknown>|null) {
  const inbox = await getInboxBySlug(slug);
  if (!inbox) return { error: json({ error: 'Inbox not found.' }, 404), inbox: null };
  if (!await ownerAllowed(inbox, req, body)) return { error: json({ error: 'Owner access required.' }, 403), inbox: null };
  return { error: null, inbox };
}
function mediaUrl(path: string|null) { return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null; }
async function cleanupFiles(paths: string[]) {
  const files = paths.filter(Boolean);
  if (!files.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(files);
  if (error) console.error('Storage cleanup failed:', error.message);
}

function mapPoll(poll: any, options: any[], votes: any[]) {
  const pollOptions = options.filter((o:any) => o.poll_id === poll.id);
  const pollVotes = votes.filter((v:any) => v.poll_id === poll.id);
  const counts = new Map<string, number>();
  for (const vote of pollVotes) counts.set(vote.option_id, (counts.get(vote.option_id) || 0) + 1);
  return {
    id: poll.id,
    slug: poll.slug,
    question: poll.question,
    inboxId: poll.inbox_id,
    createdAt: poll.created_at,
    totalVotes: pollVotes.length,
    options: pollOptions.map((o:any) => ({ id: o.id, text: o.text, votes: counts.get(o.id) || 0 }))
  };
}

async function loadPollMap(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, any>();
  if (!unique.length) return map;
  const [{ data: polls, error: pe }, { data: options, error: oe }, { data: votes, error: ve }] = await Promise.all([
    sb.from('polls').select('id,slug,inbox_id,question,created_at').in('id', unique),
    sb.from('poll_options').select('id,poll_id,text,position').in('poll_id', unique).order('position'),
    sb.from('votes').select('poll_id,option_id').in('poll_id', unique)
  ]);
  if (pe) throw pe;
  if (oe) throw oe;
  if (ve) throw ve;
  for (const poll of polls || []) map.set(poll.id, mapPoll(poll, options || [], votes || []));
  return map;
}

async function publicPollBySlug(slug: string) {
  const { data: poll, error } = await sb.from('polls').select('id,slug,inbox_id,question,created_at').eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!poll) return null;
  return (await loadPollMap([poll.id])).get(poll.id) || null;
}

const rate = new Map<string,{start:number,count:number}>();
function rateAllowed(key:string, limit:number, windowMs:number) {
  const now = Date.now();
  if (rate.size > 2000) for (const [k,v] of rate) if (now - v.start > 20 * 60 * 1000) rate.delete(k);
  const cur = rate.get(key);
  if (!cur || now - cur.start >= windowMs) {
    rate.set(key, { start: now, count: 1 });
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

async function createInbox(req: Request, user: any) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, 400);
  const displayName = clean((body as any).displayName, 40);
  const requested = clean((body as any).handle, 28);
  const root = slugify(requested || displayName);
  if (!displayName) return json({ error: 'Enter your name.' }, 400);
  if (!root) return json({ error: 'Enter a valid link name.' }, 400);
  const token = rid('tok_') + rid();
  const creatorKey = await requestKey(req);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? root : `${root.slice(0, 26)}-${crypto.randomUUID().slice(0, 5)}`;
    const row = {
      id: rid('inb_'), slug, display_name: displayName, handle: slug,
      owner_token_hash: await hash(token), owner_user_id: user.id, creator_key: creatorKey
    };
    const { data, error } = await sb.from('inboxes').insert(row).select().single();
    if (!error && data) return json({ ...publicInbox(data), ownerToken: token }, 201);
    if (error?.code !== '23505') throw error;
  }
  return json({ error: 'Could not create a unique link. Please try another name.' }, 409);
}

function voiceMime(file: File) {
  const raw = String(file.type || '').toLowerCase().split(';')[0];
  if (raw.startsWith('audio/') || raw === 'video/webm' || raw === 'video/mp4') return raw;
  const name = file.name.toLowerCase();
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.aac')) return 'audio/aac';
  return '';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const path = pathOf(req);
  try {
    if (path === '/' || path === '/health' || path === '/api/health') return json({ ok: true, name: 'NYMBOX API', version: 3 });
    let m: RegExpMatchArray | null;

    if (path === '/api/account/inboxes' && req.method === 'GET') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      const { data, error } = await sb.from('inboxes').select('*').eq('owner_user_id', auth.user.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ user: { id: auth.user.id, email: auth.user.email, displayName: clean(auth.user.user_metadata?.display_name || auth.user.user_metadata?.full_name || '', 50) }, inboxes: (data || []).map(publicInbox) });
    }

    if (path === '/api/inboxes' && req.method === 'POST') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      if (!rateAllowed(`create:${auth.user.id}`, 15, 10 * 60 * 1000)) return json({ error: 'Too many links created. Try again later.' }, 429, { 'retry-after': '600' });
      return await createInbox(req, auth.user);
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)\/claim$/)) && req.method === 'POST') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      const body = await req.json().catch(() => ({}));
      const slug = decodeURIComponent(m[1]);
      const inbox = await getInboxBySlug(slug);
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      if (inbox.owner_user_id && inbox.owner_user_id !== auth.user.id) return json({ error: 'This inbox already belongs to another account.' }, 409);
      const token = tokenFrom(req, body);
      if (!token || inbox.owner_token_hash !== await hash(token)) return json({ error: 'Owner access required.' }, 403);
      const { data, error } = await sb.from('inboxes').update({ owner_user_id: auth.user.id }).eq('id', inbox.id).select().single();
      if (error) throw error;
      return json({ ok: true, inbox: publicInbox(data) });
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)$/)) && req.method === 'GET') {
      const inbox = await getInboxBySlug(decodeURIComponent(m[1]));
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      return json(publicInbox(inbox), 200, { 'cache-control': 'public, max-age=30, s-maxage=60' });
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)$/)) && req.method === 'PATCH') {
      const old = decodeURIComponent(m[1]);
      const body = await req.json().catch(() => ({}));
      const owned = await requireOwnedInbox(old, req, body);
      if (owned.error) return owned.error;
      const desired = slugify((body as any).slug);
      if (!desired) return json({ error: 'Enter a valid link name.' }, 400);
      const { data: exists, error: ee } = await sb.from('inboxes').select('id').eq('slug', desired).neq('id', owned.inbox.id).maybeSingle();
      if (ee) throw ee;
      if (exists) return json({ error: 'That link is already taken.' }, 409);
      const { data, error } = await sb.from('inboxes').update({ slug: desired, handle: desired }).eq('id', owned.inbox.id).select().single();
      if (error) throw error;
      return json(publicInbox(data));
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)\/messages$/)) && req.method === 'GET') {
      const owned = await requireOwnedInbox(decodeURIComponent(m[1]), req);
      if (owned.error) return owned.error;
      const requested = Number(new URL(req.url).searchParams.get('limit') || 60);
      const limit = Math.max(1, Math.min(100, Number.isFinite(requested) ? requested : 60));
      const [{ data: msgs, error: me }, { data: blocks, error: be }] = await Promise.all([
        sb.from('messages').select('*').eq('inbox_id', owned.inbox.id).order('created_at', { ascending: false }).limit(limit),
        sb.from('blocks').select('sender_key').eq('inbox_id', owned.inbox.id)
      ]);
      if (me) throw me;
      if (be) throw be;
      const pollMap = await loadPollMap((msgs || []).map((x:any) => x.poll_id).filter(Boolean));
      const blocked = new Set((blocks || []).map((b:any) => b.sender_key));
      const out = (msgs || []).map((x:any) => ({
        id: x.id, inboxId: x.inbox_id, kind: x.kind, text: x.text,
        imageUrl: mediaUrl(x.image_path), imageMime: x.image_mime,
        voiceUrl: mediaUrl(x.voice_path), voiceMime: x.voice_mime,
        pollId: x.poll_id, poll: x.poll_id ? pollMap.get(x.poll_id) || null : null,
        reply: x.reply, createdAt: x.created_at, isBlocked: blocked.has(x.sender_key)
      }));
      return json({ inbox: publicInbox(owned.inbox), messages: out, limit });
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)\/polls$/)) && req.method === 'GET') {
      const owned = await requireOwnedInbox(decodeURIComponent(m[1]), req);
      if (owned.error) return owned.error;
      const { data: polls, error } = await sb.from('polls').select('id,slug,inbox_id,question,created_at').eq('inbox_id', owned.inbox.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const pollMap = await loadPollMap((polls || []).map((p:any) => p.id));
      return json({ polls: (polls || []).map((p:any) => pollMap.get(p.id)).filter(Boolean) });
    }

    if ((m = path.match(/^\/api\/inboxes\/([^/]+)\/messages$/)) && req.method === 'POST') {
      const inbox = await getInboxBySlug(decodeURIComponent(m[1]));
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      const sender = await requestKey(req);
      if (!rateAllowed(`send:${inbox.id}:${sender}`, 60, 10 * 60 * 1000)) return json({ error: 'Too many messages. Try again later.' }, 429, { 'retry-after': '600' });
      const { data: blocked, error: ble } = await sb.from('blocks').select('id').eq('inbox_id', inbox.id).eq('sender_key', sender).maybeSingle();
      if (ble) throw ble;
      if (blocked) return json({ error: 'You cannot send to this inbox.' }, 403);

      const fd = await req.formData();
      const raw = String(fd.get('kind') || 'text');
      const kind = ['text', 'image', 'voice', 'poll'].includes(raw) ? raw : 'text';
      const text = clean(fd.get('text'), kind === 'image' ? 500 : 1200);
      const uploaded:string[] = [];
      let imagePath:string|null = null, voicePath:string|null = null, imageMime:string|null = null, voiceType:string|null = null, pollId:string|null = null, poll:any = null;
      try {
        if (kind === 'text' && !text) return json({ error: 'Write a message.' }, 400);
        if (kind === 'image') {
          const image = fd.get('image');
          if (!(image instanceof File) || !image.size) return json({ error: 'Choose an image.' }, 400);
          if (!/^image\/(jpeg|png|webp|gif)$/i.test(image.type)) return json({ error: 'Use a JPEG, PNG, WebP or GIF image.' }, 400);
          if (image.size > MAX_IMAGE_BYTES) return json({ error: 'Image is too large. Maximum size is 12 MB.' }, 413);
          imagePath = `images/${rid()}-${clean(image.name, 120).replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'}`;
          const { error } = await sb.storage.from(BUCKET).upload(imagePath, image, { contentType: image.type, upsert: false, cacheControl: '31536000' });
          if (error) throw error;
          uploaded.push(imagePath);
          imageMime = image.type;
        }
        if (kind === 'voice') {
          const voice = fd.get('voice');
          if (!(voice instanceof File) || !voice.size) return json({ error: 'Record or choose a voice note.' }, 400);
          const mime = voiceMime(voice);
          if (!mime) return json({ error: 'Unsupported voice-note format. Try WebM, M4A, MP3, OGG or WAV.' }, 400);
          if (voice.size > MAX_VOICE_BYTES) return json({ error: 'Voice note is too large. Maximum size is 8 MB.' }, 413);
          voicePath = `voice/${rid()}-${clean(voice.name, 120).replace(/[^a-zA-Z0-9._-]/g, '_') || 'voice'}`;
          const { error } = await sb.storage.from(BUCKET).upload(voicePath, voice, { contentType: mime, upsert: false, cacheControl: '31536000' });
          if (error) throw error;
          uploaded.push(voicePath);
          voiceType = mime;
        }
        if (kind === 'poll') {
          const question = clean(fd.get('question'), 180);
          let opts:string[] = [];
          try {
            const parsed = JSON.parse(String(fd.get('options') || '[]'));
            if (Array.isArray(parsed)) opts = parsed.map(x => clean(x, 80)).filter(Boolean).slice(0, 8);
          } catch {}
          opts = [...new Set(opts)];
          if (!question || opts.length < 2) return json({ error: 'A poll needs a question and at least 2 different options.' }, 400);
          const root = slugify(question) || rid('poll').slice(0, 20);
          let row:any = null;
          for (let a = 0; a < 5; a++) {
            pollId = rid('poll_');
            const pslug = a === 0 ? root : `${root.slice(0, 26)}-${crypto.randomUUID().slice(0, 5)}`;
            const ins = await sb.from('polls').insert({ id: pollId, slug: pslug, inbox_id: inbox.id, question, creator_key: sender }).select().single();
            if (!ins.error && ins.data) { row = ins.data; break; }
            if (ins.error?.code !== '23505') throw ins.error;
          }
          if (!row || !pollId) return json({ error: 'Could not create the poll. Please try again.' }, 409);
          const { error: oe } = await sb.from('poll_options').insert(opts.map((t, pos) => ({ id: rid('opt_'), poll_id: pollId, text: t, position: pos })));
          if (oe) throw oe;
          poll = (await loadPollMap([pollId])).get(pollId) || null;
        }
        const id = rid('msg_');
        const { error } = await sb.from('messages').insert({
          id, inbox_id: inbox.id, kind, text,
          image_path: imagePath, image_mime: imageMime,
          voice_path: voicePath, voice_mime: voiceType,
          poll_id: pollId, sender_key: sender
        });
        if (error) throw error;
        return json({ ok: true, id, poll }, 201);
      } catch (e) {
        await cleanupFiles(uploaded);
        if (pollId) {
          const { error } = await sb.from('polls').delete().eq('id', pollId);
          if (error) console.error('Poll cleanup failed:', error.message);
        }
        throw e;
      }
    }

    if ((m = path.match(/^\/api\/messages\/([^/]+)\/reply$/)) && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const body = await req.json().catch(() => ({}));
      const { data: x, error: xe } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (xe) throw xe;
      if (!x) return json({ error: 'Message not found.' }, 404);
      const { data: i, error: ie } = await sb.from('inboxes').select('*').eq('id', x.inbox_id).maybeSingle();
      if (ie) throw ie;
      if (!await ownerAllowed(i, req, body)) return json({ error: 'Owner access required.' }, 403);
      const reply = clean((body as any).reply, 700);
      const { error } = await sb.from('messages').update({ reply }).eq('id', id);
      if (error) throw error;
      return json({ ok: true, reply });
    }

    if ((m = path.match(/^\/api\/messages\/([^/]+)\/block$/)) && req.method === 'POST') {
      const id = decodeURIComponent(m[1]);
      const body = await req.json().catch(() => ({}));
      const { data: x, error: xe } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (xe) throw xe;
      if (!x) return json({ error: 'Message not found.' }, 404);
      const { data: i, error: ie } = await sb.from('inboxes').select('*').eq('id', x.inbox_id).maybeSingle();
      if (ie) throw ie;
      if (!await ownerAllowed(i, req, body)) return json({ error: 'Owner access required.' }, 403);
      const { error } = await sb.from('blocks').upsert({ id: rid('blk_'), inbox_id: i.id, sender_key: x.sender_key }, { onConflict: 'inbox_id,sender_key', ignoreDuplicates: true });
      if (error) throw error;
      return json({ ok: true });
    }

    if ((m = path.match(/^\/api\/messages\/([^/]+)$/)) && req.method === 'DELETE') {
      const id = decodeURIComponent(m[1]);
      const body = await req.json().catch(() => ({}));
      const { data: x, error: xe } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (xe) throw xe;
      if (!x) return json({ error: 'Message not found.' }, 404);
      const { data: i, error: ie } = await sb.from('inboxes').select('*').eq('id', x.inbox_id).maybeSingle();
      if (ie) throw ie;
      if (!await ownerAllowed(i, req, body)) return json({ error: 'Owner access required.' }, 403);
      const { error: de } = await sb.from('messages').delete().eq('id', id);
      if (de) throw de;
      await cleanupFiles([x.image_path, x.voice_path].filter(Boolean));
      if (x.poll_id) {
        const { error } = await sb.from('polls').delete().eq('id', x.poll_id);
        if (error) console.error('Poll cleanup failed:', error.message);
      }
      return json({ ok: true });
    }

    if ((m = path.match(/^\/api\/polls\/([^/]+)$/)) && req.method === 'GET') {
      const poll = await publicPollBySlug(decodeURIComponent(m[1]));
      if (!poll) return json({ error: 'Poll not found.' }, 404);
      return json(poll, 200, { 'cache-control': 'public, max-age=10, s-maxage=20' });
    }

    if ((m = path.match(/^\/api\/polls\/([^/]+)\/vote$/)) && req.method === 'POST') {
      const slug = decodeURIComponent(m[1]);
      const body = await req.json().catch(() => ({}));
      const { data: p, error: pe } = await sb.from('polls').select('*').eq('slug', slug).maybeSingle();
      if (pe) throw pe;
      if (!p) return json({ error: 'Poll not found.' }, 404);
      const optionId = clean((body as any).optionId, 80);
      const { data: o, error: oe } = await sb.from('poll_options').select('id').eq('poll_id', p.id).eq('id', optionId).maybeSingle();
      if (oe) throw oe;
      if (!o) return json({ error: 'Invalid option.' }, 400);
      const voter = await hash(`${await requestKey(req)}|${clean((body as any).clientId, 120)}`);
      if (!rateAllowed(`vote:${p.id}:${voter}`, 8, 10 * 60 * 1000)) return json({ error: 'Too many vote attempts.' }, 429);
      const { data: old, error: olde } = await sb.from('votes').select('id').eq('poll_id', p.id).eq('voter_key', voter).maybeSingle();
      if (olde) throw olde;
      if (old) return json({ error: 'You already voted.', poll: await publicPollBySlug(slug) }, 409);
      const { error } = await sb.from('votes').insert({ id: rid('vote_'), poll_id: p.id, option_id: o.id, voter_key: voter });
      if (error) {
        if (error.code === '23505') return json({ error: 'You already voted.', poll: await publicPollBySlug(slug) }, 409);
        throw error;
      }
      return json({ ok: true, poll: await publicPollBySlug(slug) });
    }

    return json({ error: 'Not found.' }, 404);
  } catch (e:any) {
    console.error('NYMBOX API error:', e?.message || e);
    return json({ error: 'Request failed. Please try again.' }, 500);
  }
});
