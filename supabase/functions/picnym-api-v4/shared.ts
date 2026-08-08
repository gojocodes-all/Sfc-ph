import { createClient } from "npm:@supabase/supabase-js@2";

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const CORE = `${SUPABASE_URL}/functions/v1/picnym-api`;
export const BUCKET = 'phx-media';
export const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const enc = new TextEncoder();
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type,x-owner-token',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Max-Age': '86400'
};
export const json = (data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' } });
export const clean = (v: unknown, n=1000) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g,'').trim().slice(0,n);
export const usernameify = (v: unknown) => clean(v,40).toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24);
export const slugify = (v: unknown) => clean(v,40).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
export const rid = (p='') => p + crypto.randomUUID().replaceAll('-','').slice(0,18);
export async function hash(v:string){ const d=await crypto.subtle.digest('SHA-256',enc.encode(v)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function pathOf(req:Request){ return new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?picnym-api-v4(?=\/|$)/,'') || '/'; }
export function mediaUrl(path?:string|null){ return path ? sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null; }
export async function authUser(req:Request){ const token=(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim(); if(!token)return null; const {data,error}=await sb.auth.getUser(token); return error?null:data.user; }
export async function requireUser(req:Request){ const user=await authUser(req); return user ? {user,error:null} : {user:null,error:json({error:'Sign in required.'},401)}; }
export function ownerToken(req:Request){ return clean(req.headers.get('x-owner-token') || new URL(req.url).searchParams.get('token'),180); }
export async function inboxBySlug(slug:string){ const {data,error}=await sb.from('inboxes').select('*').eq('slug',slug).maybeSingle(); if(error)throw error; return data; }
export async function ownerAllowed(inbox:any,req:Request){ const user=await authUser(req); if(user && inbox?.creator_key===`auth:${user.id}`)return true; const token=ownerToken(req); return Boolean(token && inbox?.owner_token_hash===await hash(token)); }
export async function requireInbox(slug:string,req:Request){ const inbox=await inboxBySlug(slug); if(!inbox)return {inbox:null,error:json({error:'Inbox not found.'},404)}; if(!await ownerAllowed(inbox,req))return {inbox:null,error:json({error:'Owner access required.'},403)}; return {inbox,error:null}; }
async function uniqueUsername(user:any){ let base=usernameify(user.user_metadata?.display_name||user.user_metadata?.name||user.email?.split('@')[0]||'picnym_user'); if(base.length<3)base=`picnym_${base||'user'}`.slice(0,18); for(let i=0;i<20;i++){const x=i?`${base.slice(0,18)}_${Math.floor(1000+Math.random()*9000)}`:base; const {data,error}=await sb.from('profiles').select('user_id').eq('username',x).maybeSingle(); if(error)throw error;if(!data)return x;} return `user_${crypto.randomUUID().replaceAll('-','').slice(0,10)}`; }
export async function ensureAccount(user:any){ let {data:profile,error}=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle(); if(error)throw error; if(!profile){const inserted=await sb.from('profiles').insert({user_id:user.id,username:await uniqueUsername(user),display_name:clean(user.user_metadata?.display_name||user.user_metadata?.name||user.email?.split('@')[0]||'PICNYM user',60)}).select().single();if(inserted.error)throw inserted.error;profile=inserted.data;} let setting=await sb.from('user_settings').select('*').eq('user_id',user.id).maybeSingle();if(setting.error)throw setting.error;if(!setting.data){setting=await sb.from('user_settings').insert({user_id:user.id}).select().single();if(setting.error)throw setting.error;} return {profile,settings:setting.data}; }
export function profileDto(row:any,self=false){ if(!row)return null;const premium=row.plan==='premium'&&(!row.plan_expires_at||new Date(row.plan_expires_at).getTime()>Date.now());return {...(self?{userId:row.user_id}:{}),username:row.username,displayName:row.display_name,bio:row.bio||'',avatarUrl:mediaUrl(row.avatar_path),premium,...(self?{plan:premium?'premium':'free',planExpiresAt:row.plan_expires_at||null}:{}),createdAt:row.created_at}; }
export function settingsDto(r:any){return {theme:r?.theme||'system',discoverable:r?.discoverable!==false,allowFriendRequests:r?.allow_friend_requests!==false,showActivity:Boolean(r?.show_activity),browserNotifications:Boolean(r?.browser_notifications)};}
export function inboxSettingsDto(r:any,privateView=false){const x:any={paused:Boolean(r?.paused),registeredOnly:Boolean(r?.registered_only),friendsOnly:Boolean(r?.friends_only),allowImages:r?.allow_images!==false,allowVoice:r?.allow_voice!==false,allowPolls:r?.allow_polls!==false,hiddenWords:Array.isArray(r?.hidden_words)?r.hidden_words:[]};if(!privateView)delete x.hiddenWords;return x;}
export async function getInboxSettings(id:string){const r=await sb.from('inbox_settings').select('*').eq('inbox_id',id).maybeSingle();if(r.error)throw r.error;if(r.data)return r.data;const i=await sb.from('inbox_settings').insert({inbox_id:id}).select().single();if(i.error)throw i.error;return i.data;}
export async function publicProfileForCreator(inbox:any){const key=String(inbox?.creator_key||'');if(!key.startsWith('auth:'))return null;const {data,error}=await sb.from('profiles').select('*').eq('user_id',key.slice(5)).maybeSingle();if(error)throw error;return profileDto(data);}
export async function areFriends(a:string,b:string){if(!a||!b)return false;if(a===b)return true;const key=[a,b].sort().join(':');const {data,error}=await sb.from('friendships').select('id').eq('pair_key',key).eq('status','accepted').maybeSingle();if(error)throw error;return Boolean(data);}
export async function cleanupInbox(inbox:any){const {data:msgs,error}=await sb.from('messages').select('image_path,voice_path').eq('inbox_id',inbox.id);if(error)throw error;const files=(msgs||[]).flatMap((m:any)=>[m.image_path,m.voice_path]).filter(Boolean);if(files.length)await sb.storage.from(BUCKET).remove(files);const del=await sb.from('inboxes').delete().eq('id',inbox.id);if(del.error)throw del.error;}
export async function core(req:Request,path:string){const u=new URL(req.url);return fetch(new Request(CORE+path+u.search,req));}
export async function coreJson(req:Request,path:string){const r=await core(req,path);let data:any=null;try{data=await r.json();}catch{return {response:r,data:null}}return {response:r,data};}
export async function senderProfiles(messages:any[]){const ids=[...new Set(messages.filter(m=>m.sender_revealed&&m.sender_user_id).map(m=>m.sender_user_id))];if(!ids.length)return new Map();const {data,error}=await sb.from('profiles').select('*').in('user_id',ids);if(error)throw error;return new Map((data||[]).map((p:any)=>[p.user_id,profileDto(p)]));}
export async function profileForUserIds(ids:string[]){if(!ids.length)return new Map();const {data,error}=await sb.from('profiles').select('*').in('user_id',[...new Set(ids)]);if(error)throw error;return new Map((data||[]).map((p:any)=>[p.user_id,{...profileDto(p),userId:p.user_id}]));}
