import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
export function developmentAPI(): Plugin {
  return {name:'netronim-development-api',configureServer(server:ViteDevServer){
    server.middlewares.use(async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
      const path=(req.url||'').split('?')[0];const name=({ '/api/proxy':'proxy','/api/weather':'weather','/api/updates':'updates' } as Record<string,string>)[path];
      if(!name)return next();
      try{
        const module=await server.ssrLoadModule(`/functions/api/${name}.ts`);
        const request=new Request(`http://${req.headers.host||'localhost'}${req.url}`,{method:req.method,headers:req.headers as Record<string,string>});
        const response:Response=await module.onRequestGet({request,env:process.env,params:{},data:{},next:()=>Promise.resolve(new Response('Not found',{status:404})),waitUntil:()=>{},passThroughOnException:()=>{}});
        res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:(error as Error).message}));}
    });
  }};
}
