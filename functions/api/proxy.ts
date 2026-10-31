interface Env { PROXY_ENABLED?: string; PROXY_ALLOWED_HOSTS?: string }
const MAX_BYTES = 5 * 1024 * 1024;
const json = (value: unknown, status = 200, extra: Record<string,string> = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...extra } });
const pageCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const CACHE_MS = 60_000;
import { publicIP } from './network-security';
export { publicIP } from './network-security';
async function validateURL(raw: string, env: Env): Promise<URL> {
  if(raw.length>8192)throw new Error('The URL is too long.');
  let url:URL;try{url=new URL(raw);}catch{throw new Error('Enter a valid public website URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port)))throw new Error('Only public HTTP/HTTPS URLs on standard ports are allowed.');
  const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.lan')||host.endsWith('.home')||host.endsWith('.test')||host.endsWith('.invalid')||host==='metadata.google.internal')throw new Error('Private and local network addresses are blocked.');
  const allow=(env.PROXY_ALLOWED_HOSTS||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
  if(allow.length&&!allow.some(h=>host===h||host.endsWith('.'+h)))throw new Error('This deployment restricts browsing to its configured allowlist.');
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(host)&&!host.includes(':')) {
    const records=await Promise.all(['A','AAAA'].map(async type=>{const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('Could not verify the website address.');const data=await response.json() as {Status:number;Answer?:{type:number;data:string}[]};if(![0,3].includes(data.Status))throw new Error('DNS lookup failed.');return (data.Answer||[]).filter(a=>a.type===(type==='A'?1:28)).map(a=>a.data);}));
    const addresses=records.flat();if(!addresses.length)throw new Error('This hostname has no public address.');if(addresses.some(a=>!publicIP(a)))throw new Error('The website resolves to a private or reserved address.');
  } else if(!publicIP(host))throw new Error('Private and reserved IP addresses are blocked.');
  return url;
}
async function boundedText(response: Response): Promise<string> {
  if(Number(response.headers.get('Content-Length')||0)>MAX_BYTES)throw new Error('This page exceeds the 5 MB reader limit.');
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('This page exceeds the 5 MB reader limit.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder().decode(bytes);
}
const absolute=(value:string,base:string)=>{try{return new URL(value,base).href;}catch{return '';}};
function rewriteCSS(css:string,base:string,endpoint:string){return css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi,(all,path)=>{if(path.startsWith('data:'))return all;const url=absolute(path,base);return url?`url("${endpoint}?raw=1&url=${encodeURIComponent(url)}")`:all;}).replace(/@import\s+["']([^"']+)["']/gi,(all,path)=>{const url=absolute(path,base);return `@import "${endpoint}?raw=1&url=${encodeURIComponent(url)}"`;});}
function rewriteHTML(html:string,base:string,endpoint:string){
  html=html.replace(/<script\b[\s\S]*?(?:<\/script>|$)/gi,'').replace(/<noscript\b[\s\S]*?<\/noscript>/gi,'').replace(/<(iframe|object|embed|base|applet|frame|frameset)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<(iframe|object|embed|base|applet|frame|frameset)\b[^>]*>/gi,'').replace(/<meta\b[^>]*http-equiv\s*=\s*["']?(refresh|content-security-policy)[^>]*>/gi,'').replace(/<link\b[^>]*rel=["']?(prefetch|preconnect|dns-prefetch|manifest)["']?[^>]*>/gi,'');
  html=html.replace(/\s(on\w+|srcdoc|integrity|nonce)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/\ssrcset\s*=\s*(?:"[^"]*"|'[^']*')/gi,'');
  html=html.replace(/<(?:a|area)\b[^>]*>/gi,tag=>tag.replace(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,(all,a,b,c)=>{const target=absolute(a||b||c,base);return /^https?:/i.test(target)?` href="#" data-netronim-href="${encodeURIComponent(target)}"`:' href="#"';}));
  html=html.replace(/\b(src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,(all,attr,a,b)=>{const path=a??b;if(path.startsWith('data:'))return all;const url=absolute(path,base);return url?`${attr}="${endpoint}?raw=1&url=${encodeURIComponent(url)}"`:all;});
  html=html.replace(/<link\b[^>]*>/gi,tag=>/stylesheet/i.test(tag)?tag.replace(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i,(all,a,b)=>{const url=absolute(a||b,base);return `href="${endpoint}?raw=1&url=${encodeURIComponent(url)}"`;}):'');
  html=html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,(all,open,css,close)=>open+rewriteCSS(css,base,endpoint)+close);
  html=html.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,(all,a,b)=>{const css=a??b;if(/expression|behavior|javascript:/i.test(css))return '';return ` style="${rewriteCSS(css,base,endpoint).replace(/"/g,'&quot;')}"`;});
  const url=new URL(base);const origin=endpoint.startsWith('http')?new URL(endpoint).origin:url.origin;
  const csp=`default-src 'none'; img-src ${origin} data: blob:; style-src 'unsafe-inline' ${origin}; font-src ${origin} data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none';`;
  const head=`<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light;background:#fff}body{min-height:100vh}a{cursor:pointer}[data-netronim-href]{touch-action:manipulation}</style>`;
  const script=`<script>document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){e.preventDefault();var u=a.getAttribute('data-netronim-href');if(u)parent.postMessage({channel:'netbrowse:navigate',url:decodeURIComponent(u)},'*');}},true);document.addEventListener('submit',function(e){e.preventDefault();var f=e.target;if((f.method||'get').toLowerCase()!=='get'){parent.postMessage({channel:'netbrowse:message',message:'This reader supports GET forms only. POST sign-in and checkout forms are disabled.'},'*');return;}var u=new URL(f.getAttribute('action')||${JSON.stringify(base)});var data=new FormData(f);for(var pair of data.entries())if(typeof pair[1]==='string')u.searchParams.set(pair[0],pair[1]);parent.postMessage({channel:'netbrowse:navigate',url:u.href},'*');},true);</script>`;
  html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+head):head+html;
  return html.replace(/<\/body>/i,script+'</body>')+(html.includes('</body>')?'':script);
}
export const onRequestGet: PagesFunction<Env> = async ({request,env}) => {
  if(env.PROXY_ENABLED==='false')return json({error:'The website proxy is disabled on this deployment.'},503);
  const incoming=new URL(request.url);const raw=incoming.searchParams.get('url');if(!raw)return json({error:'Provide a public website URL in the url query parameter.'},400);
  const endpoint=new URL(incoming.pathname,incoming.origin).href;const mode=incoming.searchParams.get('mode');const isRaw=incoming.searchParams.get('raw')==='1';
  try{
    let url=await validateURL(raw,env);let response:Response|undefined;const start=Date.now();
    for(let redirect=0;redirect<=4;redirect++){
      response=await fetch(url.href,{redirect:'manual',headers:{'User-Agent':'NetronimReader/1.0 (+https://github.com/Seigh-sword/netronim)','Accept':isRaw?'image/*,text/css,*/*;q=0.8':'text/html,application/xhtml+xml','Accept-Language':'en-US,en;q=0.8'},signal:AbortSignal.timeout(12000)});
      if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('Location');await response.body?.cancel();if(!location||redirect===4)throw new Error('Too many redirects or a missing redirect target.');url=await validateURL(new URL(location,url).href,env);continue;}
      break;
    }
    if(!response)throw new Error('No response from website.');
    if(mode==='ping'){await response.body?.cancel();return json({status:response.status,latency:Date.now()-start,url:url.href});}
    const type=response.headers.get('Content-Type')||'application/octet-stream';
    if(!response.ok){ if(response.status===429){ const retry=response.headers.get('Retry-After')||undefined; const hit=pageCache.get(url.href); if(hit) return json({ ...hit.payload, cached:true, warning:'The site rate-limited the proxy; served a recent cached copy.' }); return json({error:'The website returned HTTP 429 (rate limited).',url:url.href,retryAfter:retry},429, retry?{'Retry-After':retry}:{}); } return json({error:`The website returned HTTP ${response.status}.`,url:url.href},502); }
    if(isRaw){
      if(/text\/css/i.test(type)){const css=await boundedText(response);return new Response(rewriteCSS(css,url.href,endpoint),{headers:{'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});}
      if(Number(response.headers.get('Content-Length')||0)>MAX_BYTES){await response.body?.cancel();throw new Error('This resource exceeds the 5 MB proxy limit.');}
      const bytes=await response.arrayBuffer();if(bytes.byteLength>MAX_BYTES)throw new Error('This resource exceeds the 5 MB proxy limit.');
      const safeType=/^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|font\/|audio\/|video\/|application\/(json|pdf|octet-stream)|text\/(plain|html|javascript))/.test(type)?type:'application/octet-stream';
      return new Response(bytes,{headers:{'Content-Type':safeType,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment','Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    if(!/text\/html|application\/xhtml\+xml/i.test(type))return json({download:true,url:`${endpoint}?raw=1&url=${encodeURIComponent(url.href)}`,mime:type,title:url.pathname.split('/').pop()||url.hostname});
    const cached = pageCache.get(url.href); if (cached && Date.now() - cached.at < CACHE_MS) return json({ ...cached.payload, cached: true });
    const html=await boundedText(response);const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g,'').trim()||url.hostname;
    const payload = { html: rewriteHTML(html, url.href, endpoint), url: url.href, title, contentType: type };
    pageCache.set(url.href, { at: Date.now(), payload }); if (pageCache.size > 80) { const oldest = [...pageCache.entries()].sort((a,b)=>a[1].at-b[1].at)[0]; if (oldest) pageCache.delete(oldest[0]); }
    return json(payload);
  }catch(error){return json({error:error instanceof Error?error.message:'The website could not be loaded.',hint:'The site may be offline, block proxy access, or require a full browser. Try its mobile or text version.'},502);}
};
