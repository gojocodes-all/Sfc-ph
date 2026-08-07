import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE) throw new Error('Supabase environment is unavailable.');

const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
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
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}
const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const slugify = (value: unknown) => clean(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
const rid = (prefix = '') => prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 18);
async function hash(value: string) { const digest = await crypto.subtle.digest('SHA-256', enc.encode(value)); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join(''); }
function pathOf(req: Request) { return new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?phx-api(?=\/|$)/, '') || '/'; }
function tokenFrom(req: Request, body?: Record<string,unknown>|null) { return clean(req.headers.get('x-owner-token') || body?.token || new URL(req.url).searchParams.get('token'), 160); }
async function requestKey(req: Request) { const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim(); const ua=req.headers.get('user-agent')||'unknown'; return hash(`${SERVICE.slice(0,20)}|${ip}|${ua}`); }
function publicInbox(row: any) { return row ? { id:row.id, slug:row.slug, displayName:row.display_name, handle:row.handle, createdAt:row.created_at } : null; }
async function getInboxBySlug(slug: string) { const {data,error}=await sb.from('inboxes').select('*').eq('slug',slug).maybeSingle(); if(error) throw error; return data; }
async function ownerAllowed(inbox: any, token: string) { return Boolean(inbox && token && inbox.owner_token_hash === await hash(token)); }
async function requireOwnedInbox(slug: string, token: string) { const inbox=await getInboxBySlug(slug); if(!inbox) return {error:json({error:'Inbox not found.'},404),inbox:null}; if(!await ownerAllowed(inbox,token)) return {error:json({error:'Owner access required.'},403),inbox:null}; return {error:null,inbox}; }
function mediaUrl(path: string|null) { return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null; }
async function cleanupFiles(paths: string[]) { const files=paths.filter(Boolean); if(!files.length)return; const {error}=await sb.storage.from(BUCKET).remove(files); if(error) console.error('Storage cleanup failed:',error.message); }
async function publicPoll(poll: any) {
  if(!poll) return null;
  const [{data:options,error:oe},{data:votes,error:ve}] = await Promise.all([
    sb.from('poll_options').select('*').eq('poll_id',poll.id).order('position'),
    sb.from('votes').select('option_id').eq('poll_id',poll.id)
  ]);
  if(oe) throw oe; if(ve) throw ve;
  return { id:poll.id, slug:poll.slug, question:poll.question, inboxId:poll.inbox_id, createdAt:poll.created_at, totalVotes:votes?.length||0,
    options:(options||[]).map((o:any)=>({id:o.id,text:o.text,votes:(votes||[]).filter((v:any)=>v.option_id===o.id).length})) };
}
const rate = new Map<string,{start:number,count:number}>();
function rateAllowed(key:string, limit:number, windowMs:number){ const now=Date.now(); if(rate.size>1000){for(const [k,v] of rate)if(now-v.start>20*60*1000)rate.delete(k);} const cur=rate.get(key); if(!cur||now-cur.start>=windowMs){rate.set(key,{start:now,count:1});return true;} cur.count++; return cur.count<=limit; }
async function createInbox(req: Request){
  const body=await req.json().catch(()=>null); if(!body||typeof body!=='object')return json({error:'Invalid request.'},400);
  const displayName=clean((body as any).displayName,40), requested=clean((body as any).handle,28), root=slugify(requested||displayName);
  if(!displayName)return json({error:'Enter your name.'},400); if(!root)return json({error:'Enter a valid link name.'},400);
  const token=rid('tok_')+rid(), creatorKey=await requestKey(req);
  for(let attempt=0;attempt<5;attempt++){
    const slug=attempt===0?root:`${root.slice(0,26)}-${crypto.randomUUID().slice(0,5)}`;
    const row={id:rid('inb_'),slug,display_name:displayName,handle:slug,owner_token_hash:await hash(token),creator_key:creatorKey};
    const {data,error}=await sb.from('inboxes').insert(row).select().single();
    if(!error&&data)return json({...publicInbox(data),ownerToken:token},201); if(error?.code!=='23505')throw error;
  }
  return json({error:'Could not create a unique link. Please try another name.'},409);
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const path=pathOf(req);
  try{
    if(path==='/'||path==='/health'||path==='/api/health')return json({ok:true,name:'PH X SFC ANONYMOUS API',version:2});
    let m:RegExpMatchArray|null;
    if(path==='/api/inboxes'&&req.method==='POST'){
      if(!rateAllowed(`create:${await requestKey(req)}`,20,10*60*1000))return json({error:'Too many links created. Try again later.'},429,{'retry-after':'600'});
      return await createInbox(req);
    }
    if((m=path.match(/^\/api\/inboxes\/([^/]+)$/))&&req.method==='GET'){
      const inbox=await getInboxBySlug(decodeURIComponent(m[1])); if(!inbox)return json({error:'Inbox not found.'},404); return json(publicInbox(inbox));
    }
    if((m=path.match(/^\/api\/inboxes\/([^/]+)$/))&&req.method==='PATCH'){
      const old=decodeURIComponent(m[1]), body=await req.json().catch(()=>({})), owned=await requireOwnedInbox(old,tokenFrom(req,body)); if(owned.error)return owned.error;
      const desired=slugify((body as any).slug); if(!desired)return json({error:'Enter a valid link name.'},400);
      const {data:exists,error:ee}=await sb.from('inboxes').select('id').eq('slug',desired).neq('id',owned.inbox.id).maybeSingle(); if(ee)throw ee; if(exists)return json({error:'That link is already taken.'},409);
      const {data,error}=await sb.from('inboxes').update({slug:desired,handle:desired}).eq('id',owned.inbox.id).select().single(); if(error)throw error; return json(publicInbox(data));
    }
    if((m=path.match(/^\/api\/inboxes\/([^/]+)\/messages$/))&&req.method==='GET'){
      const owned=await requireOwnedInbox(decodeURIComponent(m[1]),tokenFrom(req)); if(owned.error)return owned.error;
      const [{data:msgs,error:me},{data:blocks,error:be}]=await Promise.all([sb.from('messages').select('*').eq('inbox_id',owned.inbox.id).order('created_at',{ascending:false}),sb.from('blocks').select('sender_key').eq('inbox_id',owned.inbox.id)]); if(me)throw me;if(be)throw be;
      const out=[]; for(const x of msgs||[]){let poll=null;if(x.poll_id){const {data:p,error}=await sb.from('polls').select('*').eq('id',x.poll_id).maybeSingle();if(error)throw error;poll=await publicPoll(p);} out.push({id:x.id,inboxId:x.inbox_id,kind:x.kind,text:x.text,imageUrl:mediaUrl(x.image_path),imageMime:x.image_mime,voiceUrl:mediaUrl(x.voice_path),voiceMime:x.voice_mime,pollId:x.poll_id,poll,reply:x.reply,createdAt:x.created_at,isBlocked:(blocks||[]).some((b:any)=>b.sender_key===x.sender_key)});}
      return json({inbox:publicInbox(owned.inbox),messages:out});
    }
    if((m=path.match(/^\/api\/inboxes\/([^/]+)\/polls$/))&&req.method==='GET'){
      const owned=await requireOwnedInbox(decodeURIComponent(m[1]),tokenFrom(req));if(owned.error)return owned.error;
      const {data:polls,error}=await sb.from('polls').select('*').eq('inbox_id',owned.inbox.id).order('created_at',{ascending:false});if(error)throw error;const out=[];for(const p of polls||[])out.push(await publicPoll(p));return json({polls:out});
    }
    if((m=path.match(/^\/api\/inboxes\/([^/]+)\/messages$/))&&req.method==='POST'){
      const inbox=await getInboxBySlug(decodeURIComponent(m[1]));if(!inbox)return json({error:'Inbox not found.'},404);const sender=await requestKey(req);
      if(!rateAllowed(`send:${inbox.id}:${sender}`,80,10*60*1000))return json({error:'Too many messages. Try again later.'},429,{'retry-after':'600'});
      const {data:blocked,error:ble}=await sb.from('blocks').select('id').eq('inbox_id',inbox.id).eq('sender_key',sender).maybeSingle();if(ble)throw ble;if(blocked)return json({error:'You cannot send to this inbox.'},403);
      const fd=await req.formData(), raw=String(fd.get('kind')||'text'), kind=['text','image','voice','poll'].includes(raw)?raw:'text', text=clean(fd.get('text'),kind==='image'?500:1200);
      const uploaded:string[]=[];let imagePath:string|null=null,voicePath:string|null=null,imageMime:string|null=null,voiceMime:string|null=null,pollId:string|null=null,poll:any=null;
      try{
        if(kind==='text'&&!text)return json({error:'Write a message.'},400);
        if(kind==='image'){
          const image=fd.get('image');if(!(image instanceof File)||!image.size)return json({error:'Choose an image.'},400);if(!/^image\/(jpeg|png|webp|gif)$/i.test(image.type))return json({error:'Use a JPEG, PNG, WebP or GIF image.'},400);if(image.size>MAX_MEDIA_BYTES)return json({error:'Image is too large. Maximum size is 12 MB.'},413);
          imagePath=`images/${rid()}-${clean(image.name,120).replace(/[^a-zA-Z0-9._-]/g,'_')||'image'}`;const {error}=await sb.storage.from(BUCKET).upload(imagePath,image,{contentType:image.type,upsert:false});if(error)throw error;uploaded.push(imagePath);imageMime=image.type;
        }
        if(kind==='voice'){
          const voice=fd.get('voice');if(!(voice instanceof File)||!voice.size)return json({error:'Record or choose a voice note.'},400);if(!(voice.type.startsWith('audio/')||voice.type==='video/webm'))return json({error:'Unsupported voice-note format.'},400);if(voice.size>MAX_MEDIA_BYTES)return json({error:'Voice note is too large. Maximum size is 12 MB.'},413);
          voicePath=`voice/${rid()}-${clean(voice.name,120).replace(/[^a-zA-Z0-9._-]/g,'_')||'voice'}`;const {error}=await sb.storage.from(BUCKET).upload(voicePath,voice,{contentType:voice.type||'audio/webm',upsert:false});if(error)throw error;uploaded.push(voicePath);voiceMime=voice.type||'audio/webm';
        }
        if(kind==='poll'){
          const question=clean(fd.get('question'),180);let opts:string[]=[];try{const parsed=JSON.parse(String(fd.get('options')||'[]'));if(Array.isArray(parsed))opts=parsed.map(x=>clean(x,80)).filter(Boolean).slice(0,8);}catch{} opts=[...new Set(opts)];if(!question||opts.length<2)return json({error:'A poll needs a question and at least 2 different options.'},400);
          const root=slugify(question)||rid('poll').slice(0,20);let row:any=null;for(let a=0;a<5;a++){pollId=rid('poll_');const pslug=a===0?root:`${root.slice(0,26)}-${crypto.randomUUID().slice(0,5)}`;const ins=await sb.from('polls').insert({id:pollId,slug:pslug,inbox_id:inbox.id,question,creator_key:sender}).select().single();if(!ins.error&&ins.data){row=ins.data;break;}if(ins.error?.code!=='23505')throw ins.error;}if(!row||!pollId)return json({error:'Could not create the poll. Please try again.'},409);
          const {error:oe}=await sb.from('poll_options').insert(opts.map((t,pos)=>({id:rid('opt_'),poll_id:pollId,text:t,position:pos})));if(oe)throw oe;poll=await publicPoll(row);
        }
        const id=rid('msg_');const {error}=await sb.from('messages').insert({id,inbox_id:inbox.id,kind,text,image_path:imagePath,image_mime:imageMime,voice_path:voicePath,voice_mime:voiceMime,poll_id:pollId,sender_key:sender});if(error)throw error;return json({ok:true,id,poll},201);
      }catch(e){await cleanupFiles(uploaded);if(pollId){const {error}=await sb.from('polls').delete().eq('id',pollId);if(error)console.error('Poll cleanup failed:',error.message);}throw e;}
    }
    if((m=path.match(/^\/api\/messages\/([^/]+)\/reply$/))&&req.method==='POST'){
      const id=decodeURIComponent(m[1]),body=await req.json().catch(()=>({})),{data:x,error:xe}=await sb.from('messages').select('*').eq('id',id).maybeSingle();if(xe)throw xe;if(!x)return json({error:'Message not found.'},404);const {data:i,error:ie}=await sb.from('inboxes').select('*').eq('id',x.inbox_id).maybeSingle();if(ie)throw ie;if(!await ownerAllowed(i,tokenFrom(req,body)))return json({error:'Owner access required.'},403);const reply=clean((body as any).reply,700);const {error}=await sb.from('messages').update({reply}).eq('id',id);if(error)throw error;return json({ok:true,reply});
    }
    if((m=path.match(/^\/api\/messages\/([^/]+)\/block$/))&&req.method==='POST'){
      const id=decodeURIComponent(m[1]),body=await req.json().catch(()=>({})),{data:x,error:xe}=await sb.from('messages').select('*').eq('id',id).maybeSingle();if(xe)throw xe;if(!x)return json({error:'Message not found.'},404);const {data:i,error:ie}=await sb.from('inboxes').select('*').eq('id',x.inbox_id).maybeSingle();if(ie)throw ie;if(!await ownerAllowed(i,tokenFrom(req,body)))return json({error:'Owner access required.'},403);const {error}=await sb.from('blocks').upsert({id:rid('blk_'),inbox_id:i.id,sender_key:x.sender_key},{onConflict:'inbox_id,sender_key',ignoreDuplicates:true});if(error)throw error;return json({ok:true});
    }
    if((m=path.match(/^\/api\/messages\/([^/]+)$/))&&req.method==='DELETE'){
      const id=decodeURIComponent(m[1]),body=await req.json().catch(()=>({})),{data:x,error:xe}=await sb.from('messages').select('*').eq('id',id).maybeSingle();if(xe)throw xe;if(!x)return json({error:'Message not found.'},404);const {data:i,error:ie}=await sb.from('inboxes').select('*').eq('id',x.inbox_id).maybeSingle();if(ie)throw ie;if(!await ownerAllowed(i,tokenFrom(req,body)))return json({error:'Owner access required.'},403);const {error:de}=await sb.from('messages').delete().eq('id',id);if(de)throw de;await cleanupFiles([x.image_path,x.voice_path].filter(Boolean));if(x.poll_id){const {error}=await sb.from('polls').delete().eq('id',x.poll_id);if(error)console.error('Poll cleanup failed:',error.message);}return json({ok:true});
    }
    if((m=path.match(/^\/api\/polls\/([^/]+)$/))&&req.method==='GET'){
      const {data:p,error}=await sb.from('polls').select('*').eq('slug',decodeURIComponent(m[1])).maybeSingle();if(error)throw error;if(!p)return json({error:'Poll not found.'},404);return json(await publicPoll(p));
    }
    if((m=path.match(/^\/api\/polls\/([^/]+)\/vote$/))&&req.method==='POST'){
      const slug=decodeURIComponent(m[1]),body=await req.json().catch(()=>({})),{data:p,error:pe}=await sb.from('polls').select('*').eq('slug',slug).maybeSingle();if(pe)throw pe;if(!p)return json({error:'Poll not found.'},404);const optionId=clean((body as any).optionId,80),{data:o,error:oe}=await sb.from('poll_options').select('id').eq('poll_id',p.id).eq('id',optionId).maybeSingle();if(oe)throw oe;if(!o)return json({error:'Invalid option.'},400);const voter=await hash(`${await requestKey(req)}|${clean((body as any).clientId,120)}`);if(!rateAllowed(`vote:${p.id}:${voter}`,8,10*60*1000))return json({error:'Too many vote attempts.'},429);const {data:old,error:olde}=await sb.from('votes').select('id').eq('poll_id',p.id).eq('voter_key',voter).maybeSingle();if(olde)throw olde;if(old)return json({error:'You already voted.',poll:await publicPoll(p)},409);const {error}=await sb.from('votes').insert({id:rid('vote_'),poll_id:p.id,option_id:o.id,voter_key:voter});if(error){if(error.code==='23505')return json({error:'You already voted.',poll:await publicPoll(p)},409);throw error;}return json({ok:true,poll:await publicPoll(p)});
    }
    return json({error:'Not found.'},404);
  }catch(e:any){console.error('PH X SFC API error:',e?.message||e);return json({error:'Request failed. Please try again.'},500);}
});
