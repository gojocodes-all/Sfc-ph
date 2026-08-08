import { core, cors, json, pathOf } from './shared.ts';
import { handleAccount } from './account.ts';
import { handleSocial } from './social.ts';
import { handleInbox, handleMessageTools } from './inbox.ts';

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const path=pathOf(req);const url=new URL(req.url);
  try{
    if(path==='/'||path==='/health'||path==='/api/health')return json({ok:true,name:'PICNYM API',version:4});
    for(const handler of [() => handleAccount(req,path), () => handleSocial(req,path,url), () => handleInbox(req,path), () => handleMessageTools(req,path)]){
      const response=await handler();if(response)return response;
    }
    return core(req,path);
  }catch(error:any){console.error('PICNYM v4 error:',error?.message||error);return json({error:'Request failed. Please try again.'},500);}
});
