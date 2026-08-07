import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE) throw new Error('Supabase environment is unavailable.');

const sb = createClient(SUPABASE_URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const BUCKET = 'phx-media';
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
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
    headers: {
      ...cors,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra
    }
  });
}

const clean = (value: unknown, max = 1000) => String(value ?? '')
  .replace(/[\u0000-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);
const slugify = (value: unknown) => clean(value, 40)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 32);
const rid = (prefix = '') => prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 18);

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function pathOf(req: Request) {
  return new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?picnym-api(?=\/|$)/, '') || '/';
}

function tokenFrom(req: Request, body?: Record<string,unknown>|null) {
  return clean(req.headers.get('x-owner-token') || body?.token || new URL(req.url).searchParams.get('token'), 180);
}

async function authUser(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function requireUser(req: Request) {
  const user = await authUser(req);
  return user ? { user, error: null } : { user: null, error: json({ error: 'Sign in required.' }, 401) };
}

async function requestKey(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();
  const ua = req.headers.get('user-agent') || 'unknown';
  return hash(`${SERVICE.slice(0, 20)}|${ip}|${ua}`);
}

function publicInbox(row: any) {
  return row ? {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    handle: row.handle,
    createdAt: row.created_at
  } : null;
}

async function getInboxBySlug(slug: string) {
  const { data, error } = await sb.from('inboxes').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

async function ownerAllowed(inbox: any, req: Request, suppliedToken = '') {
  if (!inbox) return false;
  const user = await authUser(req);
  if (user && inbox.creator_key === `auth:${user.id}`) return true;
  const token = suppliedToken || tokenFrom(req);
  return Boolean(token && inbox.owner_token_hash === await hash(token));
}

async function requireOwnedInbox(slug: string, req: Request, suppliedToken = '') {
  const inbox = await getInboxBySlug(slug);
  if (!inbox) return { error: json({ error: 'Inbox not found.' }, 404), inbox: null };
  if (!await ownerAllowed(inbox, req, suppliedToken)) {
    return { error: json({ error: 'Owner access required.' }, 403), inbox: null };
  }
  return { error: null, inbox };
}

function mediaUrl(path: string|null) {
  return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

async function cleanupFiles(paths: Array<string|null|undefined>) {
  const files = paths.filter(Boolean) as string[];
  if (!files.length) return;
  const { error } = await sb.storage.from(BUCKET).remove(files);
  if (error) console.error('Storage cleanup failed:', error.message);
}

const rate = new Map<string,{start:number,count:number}>();
function rateAllowed(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (rate.size > 2000) {
    for (const [k, value] of rate) if (now - value.start > 20 * 60 * 1000) rate.delete(k);
  }
  const current = rate.get(key);
  if (!current || now - current.start >= windowMs) {
    rate.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function intParam(url: URL, name: string, fallback: number, max: number) {
  const raw = Number(url.searchParams.get(name));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}

async function pollBundle(polls: any[]) {
  if (!polls.length) return new Map<string, any>();
  const ids = polls.map((poll) => poll.id);
  const [{ data: options, error: oe }, { data: votes, error: ve }] = await Promise.all([
    sb.from('poll_options').select('*').in('poll_id', ids).order('position'),
    sb.from('votes').select('poll_id,option_id').in('poll_id', ids)
  ]);
  if (oe) throw oe;
  if (ve) throw ve;
  const optionsByPoll = new Map<string, any[]>();
  const votesByPoll = new Map<string, any[]>();
  for (const option of options || []) {
    const list = optionsByPoll.get(option.poll_id) || [];
    list.push(option);
    optionsByPoll.set(option.poll_id, list);
  }
  for (const vote of votes || []) {
    const list = votesByPoll.get(vote.poll_id) || [];
    list.push(vote);
    votesByPoll.set(vote.poll_id, list);
  }
  const result = new Map<string, any>();
  for (const poll of polls) {
    const pollOptions = optionsByPoll.get(poll.id) || [];
    const pollVotes = votesByPoll.get(poll.id) || [];
    result.set(poll.id, {
      id: poll.id,
      slug: poll.slug,
      question: poll.question,
      inboxId: poll.inbox_id,
      createdAt: poll.created_at,
      totalVotes: pollVotes.length,
      options: pollOptions.map((option) => ({
        id: option.id,
        text: option.text,
        votes: pollVotes.filter((vote) => vote.option_id === option.id).length
      }))
    });
  }
  return result;
}

async function publicPollByRow(poll: any) {
  if (!poll) return null;
  return (await pollBundle([poll])).get(poll.id) || null;
}

async function createInbox(req: Request, user: any) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, 400);
  const displayName = clean((body as any).displayName || user.user_metadata?.display_name || user.user_metadata?.name, 40);
  const requested = clean((body as any).handle, 28);
  const root = slugify(requested || displayName);
  if (!displayName) return json({ error: 'Enter your name.' }, 400);
  if (!root) return json({ error: 'Enter a valid link name.' }, 400);
  const token = rid('tok_') + rid();
  const creatorKey = `auth:${user.id}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? root : `${root.slice(0, 26)}-${crypto.randomUUID().slice(0, 5)}`;
    const row = {
      id: rid('inb_'),
      slug,
      display_name: displayName,
      handle: slug,
      owner_token_hash: await hash(token),
      creator_key: creatorKey
    };
    const { data, error } = await sb.from('inboxes').insert(row).select().single();
    if (!error && data) return json({ ...publicInbox(data), ownerToken: token }, 201);
    if (error?.code !== '23505') throw error;
  }
  return json({ error: 'Could not create a unique link. Please try another name.' }, 409);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const path = pathOf(req);
  const url = new URL(req.url);
  try {
    if (path === '/' || path === '/health' || path === '/api/health') {
      return json({ ok: true, name: 'PICNYM API', version: 3 });
    }

    let match: RegExpMatchArray | null;

    if (path === '/api/account' && req.method === 'GET') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      const { data: inboxes, error } = await sb.from('inboxes')
        .select('id,slug,display_name,handle,created_at')
        .eq('creator_key', `auth:${auth.user.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({
        user: {
          id: auth.user.id,
          email: auth.user.email,
          displayName: auth.user.user_metadata?.display_name || auth.user.user_metadata?.name || ''
        },
        inboxes: (inboxes || []).map(publicInbox)
      });
    }

    if (path === '/api/inboxes' && req.method === 'POST') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      if (!rateAllowed(`create:${auth.user.id}`, 20, 10 * 60 * 1000)) {
        return json({ error: 'Too many links created. Try again later.' }, 429, { 'retry-after': '600' });
      }
      return await createInbox(req, auth.user);
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)\/claim$/)) && req.method === 'POST') {
      const auth = await requireUser(req);
      if (auth.error) return auth.error;
      const slug = decodeURIComponent(match[1]);
      const inbox = await getInboxBySlug(slug);
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      const token = tokenFrom(req);
      if (!token || inbox.owner_token_hash !== await hash(token)) return json({ error: 'The original owner token is required.' }, 403);
      if (String(inbox.creator_key || '').startsWith('auth:') && inbox.creator_key !== `auth:${auth.user.id}`) {
        return json({ error: 'This inbox already belongs to another account.' }, 409);
      }
      const { data, error } = await sb.from('inboxes')
        .update({ creator_key: `auth:${auth.user.id}` })
        .eq('id', inbox.id)
        .select()
        .single();
      if (error) throw error;
      return json({ ok: true, inbox: publicInbox(data) });
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)$/)) && req.method === 'GET') {
      const inbox = await getInboxBySlug(decodeURIComponent(match[1]));
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      return json(publicInbox(inbox), 200, { 'cache-control': 'public, max-age=20, stale-while-revalidate=60' });
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)$/)) && req.method === 'PATCH') {
      const oldSlug = decodeURIComponent(match[1]);
      const body = await req.json().catch(() => ({}));
      const owned = await requireOwnedInbox(oldSlug, req, tokenFrom(req, body));
      if (owned.error) return owned.error;
      const desired = slugify((body as any).slug);
      if (!desired) return json({ error: 'Enter a valid link name.' }, 400);
      const { data: exists, error: existsError } = await sb.from('inboxes')
        .select('id').eq('slug', desired).neq('id', owned.inbox.id).maybeSingle();
      if (existsError) throw existsError;
      if (exists) return json({ error: 'That link is already taken.' }, 409);
      const { data, error } = await sb.from('inboxes')
        .update({ slug: desired, handle: desired })
        .eq('id', owned.inbox.id).select().single();
      if (error) throw error;
      return json(publicInbox(data));
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)\/messages$/)) && req.method === 'GET') {
      const owned = await requireOwnedInbox(decodeURIComponent(match[1]), req, tokenFrom(req));
      if (owned.error) return owned.error;
      const limit = intParam(url, 'limit', 40, 80);
      const before = url.searchParams.get('before');
      let query = sb.from('messages').select('*')
        .eq('inbox_id', owned.inbox.id)
        .order('created_at', { ascending: false })
        .limit(limit + 1);
      if (before && !Number.isNaN(new Date(before).getTime())) query = query.lt('created_at', before);
      const [{ data: rows, error: messageError }, { data: blocks, error: blockError }] = await Promise.all([
        query,
        sb.from('blocks').select('sender_key').eq('inbox_id', owned.inbox.id)
      ]);
      if (messageError) throw messageError;
      if (blockError) throw blockError;
      const messages = rows || [];
      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;
      const pollIds = [...new Set(page.map((item: any) => item.poll_id).filter(Boolean))];
      let pollMap = new Map<string, any>();
      if (pollIds.length) {
        const { data: polls, error } = await sb.from('polls').select('*').in('id', pollIds);
        if (error) throw error;
        pollMap = await pollBundle(polls || []);
      }
      const blocked = new Set((blocks || []).map((item: any) => item.sender_key));
      const output = page.map((item: any) => ({
        id: item.id,
        inboxId: item.inbox_id,
        kind: item.kind,
        text: item.text,
        imageUrl: mediaUrl(item.image_path),
        imageMime: item.image_mime,
        voiceUrl: mediaUrl(item.voice_path),
        voiceMime: item.voice_mime,
        pollId: item.poll_id,
        poll: item.poll_id ? pollMap.get(item.poll_id) || null : null,
        reply: item.reply,
        createdAt: item.created_at,
        isBlocked: blocked.has(item.sender_key)
      }));
      return json({
        inbox: publicInbox(owned.inbox),
        messages: output,
        hasMore,
        nextCursor: hasMore && output.length ? output[output.length - 1].createdAt : null
      });
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)\/polls$/)) && req.method === 'GET') {
      const owned = await requireOwnedInbox(decodeURIComponent(match[1]), req, tokenFrom(req));
      if (owned.error) return owned.error;
      const limit = intParam(url, 'limit', 50, 100);
      const { data: polls, error } = await sb.from('polls').select('*')
        .eq('inbox_id', owned.inbox.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      const map = await pollBundle(polls || []);
      return json({ polls: (polls || []).map((poll: any) => map.get(poll.id)) });
    }

    if ((match = path.match(/^\/api\/inboxes\/([^/]+)\/messages$/)) && req.method === 'POST') {
      const inbox = await getInboxBySlug(decodeURIComponent(match[1]));
      if (!inbox) return json({ error: 'Inbox not found.' }, 404);
      const sender = await requestKey(req);
      if (!rateAllowed(`send:${inbox.id}:${sender}`, 80, 10 * 60 * 1000)) {
        return json({ error: 'Too many messages. Try again later.' }, 429, { 'retry-after': '600' });
      }
      const { data: blocked, error: blockedError } = await sb.from('blocks')
        .select('id').eq('inbox_id', inbox.id).eq('sender_key', sender).maybeSingle();
      if (blockedError) throw blockedError;
      if (blocked) return json({ error: 'You cannot send to this inbox.' }, 403);

      const form = await req.formData();
      const rawKind = String(form.get('kind') || 'text');
      const kind = ['text', 'image', 'voice', 'poll'].includes(rawKind) ? rawKind : 'text';
      const text = clean(form.get('text'), kind === 'image' ? 500 : 1200);
      const uploaded: string[] = [];
      let imagePath: string|null = null;
      let voicePath: string|null = null;
      let imageMime: string|null = null;
      let voiceMime: string|null = null;
      let pollId: string|null = null;
      let poll: any = null;

      try {
        if (kind === 'text' && !text) return json({ error: 'Write a message.' }, 400);

        if (kind === 'image') {
          const image = form.get('image');
          if (!(image instanceof File) || !image.size) return json({ error: 'Choose an image.' }, 400);
          const baseMime = String(image.type || '').toLowerCase().split(';')[0].trim();
          if (!/^image\/(jpeg|png|webp|gif)$/i.test(baseMime)) return json({ error: 'Use a JPEG, PNG, WebP or GIF image.' }, 400);
          if (image.size > MAX_MEDIA_BYTES) return json({ error: 'Image is too large. Maximum size is 12 MB.' }, 413);
          imagePath = `images/${rid()}-${clean(image.name, 120).replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'}`;
          const { error } = await sb.storage.from(BUCKET).upload(imagePath, image, { contentType: baseMime, upsert: false });
          if (error) throw error;
          uploaded.push(imagePath);
          imageMime = baseMime;
        }

        if (kind === 'voice') {
          const voice = form.get('voice');
          if (!(voice instanceof File) || !voice.size) return json({ error: 'Record or choose a voice note.' }, 400);
          const baseMime = String(voice.type || '').toLowerCase().split(';')[0].trim();
          const allowed = baseMime.startsWith('audio/') || baseMime === 'video/webm';
          if (!allowed) return json({ error: `Unsupported voice-note format${baseMime ? ` (${baseMime})` : ''}.` }, 400);
          if (voice.size > MAX_MEDIA_BYTES) return json({ error: 'Voice note is too large. Maximum size is 12 MB.' }, 413);
          voicePath = `voice/${rid()}-${clean(voice.name, 120).replace(/[^a-zA-Z0-9._-]/g, '_') || 'voice'}`;
          voiceMime = baseMime || 'audio/webm';
          const { error } = await sb.storage.from(BUCKET).upload(voicePath, voice, { contentType: voiceMime, upsert: false });
          if (error) throw error;
          uploaded.push(voicePath);
        }

        if (kind === 'poll') {
          const question = clean(form.get('question'), 180);
          let choices: string[] = [];
          try {
            const parsed = JSON.parse(String(form.get('options') || '[]'));
            if (Array.isArray(parsed)) choices = parsed.map((value) => clean(value, 80)).filter(Boolean).slice(0, 8);
          } catch {}
          choices = [...new Set(choices)];
          if (!question || choices.length < 2) return json({ error: 'A poll needs a question and at least 2 different options.' }, 400);
          const root = slugify(question) || rid('poll').slice(0, 20);
          let row: any = null;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            pollId = rid('poll_');
            const pollSlug = attempt === 0 ? root : `${root.slice(0, 26)}-${crypto.randomUUID().slice(0, 5)}`;
            const inserted = await sb.from('polls').insert({
              id: pollId,
              slug: pollSlug,
              inbox_id: inbox.id,
              question,
              creator_key: sender
            }).select().single();
            if (!inserted.error && inserted.data) { row = inserted.data; break; }
            if (inserted.error?.code !== '23505') throw inserted.error;
          }
          if (!row || !pollId) return json({ error: 'Could not create the poll. Please try again.' }, 409);
          const { error: optionError } = await sb.from('poll_options').insert(
            choices.map((choice, position) => ({ id: rid('opt_'), poll_id: pollId, text: choice, position }))
          );
          if (optionError) throw optionError;
          poll = await publicPollByRow(row);
        }

        const id = rid('msg_');
        const { error } = await sb.from('messages').insert({
          id,
          inbox_id: inbox.id,
          kind,
          text,
          image_path: imagePath,
          image_mime: imageMime,
          voice_path: voicePath,
          voice_mime: voiceMime,
          poll_id: pollId,
          sender_key: sender
        });
        if (error) throw error;
        return json({ ok: true, id, poll }, 201);
      } catch (error) {
        await cleanupFiles(uploaded);
        if (pollId) {
          const { error: cleanupError } = await sb.from('polls').delete().eq('id', pollId);
          if (cleanupError) console.error('Poll cleanup failed:', cleanupError.message);
        }
        throw error;
      }
    }

    if ((match = path.match(/^\/api\/messages\/([^/]+)\/reply$/)) && req.method === 'POST') {
      const id = decodeURIComponent(match[1]);
      const body = await req.json().catch(() => ({}));
      const { data: message, error: messageError } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return json({ error: 'Message not found.' }, 404);
      const { data: inbox, error: inboxError } = await sb.from('inboxes').select('*').eq('id', message.inbox_id).maybeSingle();
      if (inboxError) throw inboxError;
      if (!await ownerAllowed(inbox, req, tokenFrom(req, body))) return json({ error: 'Owner access required.' }, 403);
      const reply = clean((body as any).reply, 700);
      const { error } = await sb.from('messages').update({ reply }).eq('id', id);
      if (error) throw error;
      return json({ ok: true, reply });
    }

    if ((match = path.match(/^\/api\/messages\/([^/]+)\/block$/)) && req.method === 'POST') {
      const id = decodeURIComponent(match[1]);
      const body = await req.json().catch(() => ({}));
      const { data: message, error: messageError } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return json({ error: 'Message not found.' }, 404);
      const { data: inbox, error: inboxError } = await sb.from('inboxes').select('*').eq('id', message.inbox_id).maybeSingle();
      if (inboxError) throw inboxError;
      if (!await ownerAllowed(inbox, req, tokenFrom(req, body))) return json({ error: 'Owner access required.' }, 403);
      const { error } = await sb.from('blocks').upsert({
        id: rid('blk_'), inbox_id: inbox.id, sender_key: message.sender_key
      }, { onConflict: 'inbox_id,sender_key', ignoreDuplicates: true });
      if (error) throw error;
      return json({ ok: true });
    }

    if ((match = path.match(/^\/api\/messages\/([^/]+)$/)) && req.method === 'DELETE') {
      const id = decodeURIComponent(match[1]);
      const body = await req.json().catch(() => ({}));
      const { data: message, error: messageError } = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return json({ error: 'Message not found.' }, 404);
      const { data: inbox, error: inboxError } = await sb.from('inboxes').select('*').eq('id', message.inbox_id).maybeSingle();
      if (inboxError) throw inboxError;
      if (!await ownerAllowed(inbox, req, tokenFrom(req, body))) return json({ error: 'Owner access required.' }, 403);
      const { error: deleteError } = await sb.from('messages').delete().eq('id', id);
      if (deleteError) throw deleteError;
      await cleanupFiles([message.image_path, message.voice_path]);
      if (message.poll_id) {
        const { error } = await sb.from('polls').delete().eq('id', message.poll_id);
        if (error) console.error('Poll cleanup failed:', error.message);
      }
      return json({ ok: true });
    }

    if ((match = path.match(/^\/api\/polls\/([^/]+)$/)) && req.method === 'GET') {
      const { data: poll, error } = await sb.from('polls').select('*').eq('slug', decodeURIComponent(match[1])).maybeSingle();
      if (error) throw error;
      if (!poll) return json({ error: 'Poll not found.' }, 404);
      return json(await publicPollByRow(poll), 200, { 'cache-control': 'public, max-age=5, stale-while-revalidate=20' });
    }

    if ((match = path.match(/^\/api\/polls\/([^/]+)\/vote$/)) && req.method === 'POST') {
      const slug = decodeURIComponent(match[1]);
      const body = await req.json().catch(() => ({}));
      const { data: poll, error: pollError } = await sb.from('polls').select('*').eq('slug', slug).maybeSingle();
      if (pollError) throw pollError;
      if (!poll) return json({ error: 'Poll not found.' }, 404);
      const optionId = clean((body as any).optionId, 80);
      const { data: option, error: optionError } = await sb.from('poll_options')
        .select('id').eq('poll_id', poll.id).eq('id', optionId).maybeSingle();
      if (optionError) throw optionError;
      if (!option) return json({ error: 'Invalid option.' }, 400);
      const voter = await hash(`${await requestKey(req)}|${clean((body as any).clientId, 120)}`);
      if (!rateAllowed(`vote:${poll.id}:${voter}`, 8, 10 * 60 * 1000)) return json({ error: 'Too many vote attempts.' }, 429);
      const { data: old, error: oldError } = await sb.from('votes').select('id')
        .eq('poll_id', poll.id).eq('voter_key', voter).maybeSingle();
      if (oldError) throw oldError;
      if (old) return json({ error: 'You already voted.', poll: await publicPollByRow(poll) }, 409);
      const { error } = await sb.from('votes').insert({ id: rid('vote_'), poll_id: poll.id, option_id: option.id, voter_key: voter });
      if (error) {
        if (error.code === '23505') return json({ error: 'You already voted.', poll: await publicPollByRow(poll) }, 409);
        throw error;
      }
      return json({ ok: true, poll: await publicPollByRow(poll) });
    }

    return json({ error: 'Not found.' }, 404);
  } catch (error: any) {
    console.error('PICNYM API error:', error?.message || error);
    return json({ error: 'Request failed. Please try again.' }, 500);
  }
});
