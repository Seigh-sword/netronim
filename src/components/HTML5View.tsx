import { useEffect, useRef, useState } from 'react';
import type { AppProps, Permission } from '../kernel/types';
import type { InstalledPackage } from '../kernel/types';
import { kernel } from '../kernel/kernel';
import { db } from '../kernel/db';
import { normalizePath, escapeHTML, dialog } from '../kernel/utils';
import { osStore } from '../kernel/store';
import { sanitizeDesktopPatch, desktopToXML, parseDesktopXML } from '../kernel/desktop';
import { Loading, ErrorNotice } from './ui';

async function dataURL(bytes: Uint8Array | Blob, mime = 'application/octet-stream') {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(bytes instanceof Blob ? bytes : new Blob([bytes as BufferSource], { type: mime })); });
}
const assetMime = (path: string) => ({ png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', nif:'image/webp', svg:'image/svg+xml', css:'text/css', js:'text/javascript', wasm:'application/wasm', aud:'audio/webm', mp3:'audio/mpeg', wav:'audio/wav', woff2:'font/woff2', json:'application/json' }[path.split('.').pop() || ''] || 'application/octet-stream');
async function prepare(pkg: InstalledPackage, token: string): Promise<string> {
  const decoder = new TextDecoder(); const files = pkg.files || {}; let html = files['index.html'] ? decoder.decode(files['index.html']) : '<!doctype html><html><body></body></html>';
  const assets: Record<string,string> = {};
  for (const [name, bytes] of Object.entries(files)) if (name.startsWith('assets/')) assets[name] = await dataURL(bytes, assetMime(name));
  html = html.replace(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (all, before, src, third) => files[src] ? `<script ${before} ${third}>${decoder.decode(files[src]).replace(/<\/script/gi,'<\\/script')}</script>` : all);
  html = html.replace(/<link\b([^>]*)href=["']([^"']+)["']([^>]*)>/gi, (all, before, href) => /\.css$/i.test(href) && files[href] ? `<style>${decoder.decode(files[href]).replace(/<\/style/gi,'<\\/style')}</style>` : all);
  html = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (all, attr, path) => assets[path] ? `${attr}="${assets[path]}"` : all);
  html = html.replace(/url\(["']?(assets\/[^"')\s]+)["']?\)/gi, (all, path) => assets[path] ? `url("${assets[path]}")` : all);
  const network = pkg.manifest.permissions.includes('network');
  const csp = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' ${network ? 'https:' : ''}; style-src 'unsafe-inline'; img-src data: blob: ${network ? 'https: http:' : ''}; media-src data: blob:; font-src data:; connect-src ${network ? 'https: http:' : "'none'"}; frame-src ${network ? 'https:' : "'none'"}; form-action ${network ? 'https:' : "'none'"}; base-uri 'none'; object-src 'none';`;
  const bridge = `<script>(()=>{const pending=new Map();let seq=0;const token=${JSON.stringify(token)};window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!=='netronim:response')return;const p=pending.get(e.data.id);if(p){clearTimeout(p.timer);pending.delete(e.data.id);e.data.error?p.reject(new Error(e.data.error)):p.resolve(e.data.result);}});const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('OS request timed out'));},15000);pending.set(id,{resolve,reject,timer});parent.postMessage({channel:'netronim:request',token,id,method,params},'*');});const api=Object.freeze({version:'1.0.0',app:${JSON.stringify({ id:pkg.manifest.id,name:pkg.manifest.name,permissions:pkg.manifest.permissions })},fs:{list:path=>call('fs.list',{path}),read:path=>call('fs.read',{path}),write:(path,content)=>call('fs.write',{path,content})},storage:{get:key=>call('storage.get',{key}),set:(key,value)=>call('storage.set',{key,value})},clipboard:{read:()=>call('clipboard.read'),write:text=>call('clipboard.write',{text})},notify:(title,message)=>call('notify',{title,message}),process:()=>call('process')});window.netronim=api;window.ronim=Object.freeze({...api,desktop:{get:()=>call('desktop.get'),set:patch=>call('desktop.set',{patch}),exportXML:()=>call('desktop.exportXML'),applyXML:xml=>call('desktop.applyXML',{xml}),pin:(appId,target)=>call('desktop.pin',{appId,target}),unpin:(appId,target)=>call('desktop.unpin',{appId,target}),addShortcut:(appId,x,y)=>call('desktop.addShortcut',{appId,x,y}),removeShortcut:appId=>call('desktop.removeShortcut',{appId})},apps:{list:()=>call('apps.list'),launch:appId=>call('apps.launch',{appId}),uninstall:appId=>call('apps.uninstall',{appId})}});window.dispatchEvent(new Event('netronim:ready'));})();</script>`;
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeHTML(csp)}"><meta name="viewport" content="width=device-width,initial-scale=1">`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, match => match + meta + bridge); else html = `<head>${meta}${bridge}</head>` + html;
  return html;
}
export default function HTML5View({ process, window: win }: AppProps) {
  const frame = useRef<HTMLIFrameElement>(null); const [html, setHTML] = useState(''); const [error, setError] = useState('');
  const pkg = kernel.packages.get(win.appId); const token = useRef(crypto.randomUUID()).current;
  useEffect(() => { if (!pkg) return; let active = true; prepare(pkg, token).then(result => active && setHTML(result)).catch(e => active && setError(e.message)); return () => { active = false; }; }, [pkg?.manifest.id, pkg?.manifest.version, token]);
  useEffect(() => {
    if (!pkg) return;
    const permission = (p: Permission) => { if (!pkg.manifest.permissions.includes(p)) throw new Error(`Permission denied: ${p}`); };
    const handler = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== 'netronim:request' || event.data.token !== token) return;
      const { id, method, params = {} } = event.data; let result: unknown, error: string | undefined;
      try {
        if (typeof method !== 'string' || typeof id !== 'number') throw new Error('Invalid bridge request.');
        switch (method) {
          case 'fs.list': permission('fs:read'); result = kernel.fs.list(normalizePath(String(params.path || '/Home'))); break;
          case 'fs.read': { permission('fs:read'); const path = normalizePath(String(params.path)); const node = kernel.fs.node(path); if (!node || node.size > 8 * 1024 * 1024) throw new Error('File missing or larger than the 8 MB bridge limit.'); const blob = await kernel.fs.read(path); result = { mime: node.mime, text: node.kind === 'text' ? await blob.text() : undefined, base64: node.kind !== 'text' ? await dataURL(blob, node.mime) : undefined }; break; }
          case 'fs.write': permission('fs:write'); if (typeof params.content !== 'string' || params.content.length > 8 * 1024 * 1024) throw new Error('Bridge writes are limited to 8 MB of text.'); result = await kernel.fs.write(normalizePath(String(params.path)), params.content); break;
          case 'storage.get': { if (typeof params.key !== 'string' || params.key.length > 120) throw new Error('Invalid storage key.'); result = (await db.get<{ value: unknown }>('kv', `bridge:${win.appId}:${params.key}`))?.value ?? null; break; }
          case 'storage.set': { if (typeof params.key !== 'string' || params.key.length > 120 || JSON.stringify(params.value).length > 1024 * 1024) throw new Error('Storage keys must be short and values under 1 MB.'); const keys = await db.all<{ key: string }>('kv'); if (keys.filter(k => k.key.startsWith(`bridge:${win.appId}:`)).length >= 64 && !keys.some(k => k.key === `bridge:${win.appId}:${params.key}`)) throw new Error('App storage limit: 64 keys.'); await db.put('kv', { key: `bridge:${win.appId}:${params.key}`, value: params.value }); result = true; break; }
          case 'clipboard.read': permission('clipboard'); result = await navigator.clipboard.readText(); break;
          case 'clipboard.write': permission('clipboard'); if (typeof params.text !== 'string' || params.text.length > 100000) throw new Error('Invalid clipboard text.'); await kernel.copy(params.text); result = true; break;
          case 'notify': permission('notifications'); kernel.notify(String(params.title).slice(0,100), String(params.message).slice(0,500), win.appId); result = true; break;
          case 'process': result = { id: process.id, appId: process.appId }; break;
          case 'desktop.get': { permission('desktop:read'); const s = osStore.getState().settings; result = { wallpaper: s.wallpaper, theme: s.theme, accent: s.accent, uiScale: s.uiScale, brightness: s.brightness, taskbar: s.taskbar, taskbarPinned: s.taskbarPinned, desktopShortcuts: s.desktopShortcuts, iconPositions: s.iconPositions, desktopIconSize: s.desktopIconSize, desktopGrid: s.desktopGrid, desktopShowLabels: s.desktopShowLabels }; break; }
          case 'desktop.set': permission('desktop:write'); await kernel.settings(sanitizeDesktopPatch(params.patch)); result = true; break;
          case 'desktop.exportXML': permission('desktop:read'); result = desktopToXML(osStore.getState().settings); break;
          case 'desktop.applyXML': permission('desktop:write'); if (typeof params.xml !== 'string') throw new Error('Expected XML text.'); await kernel.settings(parseDesktopXML(params.xml)); result = true; break;
          case 'desktop.pin': case 'desktop.unpin': case 'desktop.addShortcut': case 'desktop.removeShortcut': {
            permission('desktop:write'); const appId = String(params.appId || ''); if (!kernel.packages.get(appId)) throw new Error('App is not installed.');
            const s = osStore.getState().settings; const target = params.target === 'desktop' ? 'desktop' : 'taskbar';
            if (method === 'desktop.pin') { if (target === 'desktop') await kernel.settings({ desktopShortcuts: [...new Set([...s.desktopShortcuts, appId])] }); else await kernel.settings({ taskbarPinned: [...new Set([...s.taskbarPinned, appId])] }); }
            if (method === 'desktop.unpin') { if (target === 'desktop') await kernel.settings({ desktopShortcuts: s.desktopShortcuts.filter(x => x !== appId) }); else await kernel.settings({ taskbarPinned: s.taskbarPinned.filter(x => x !== appId) }); }
            if (method === 'desktop.addShortcut') { const iconPositions = { ...s.iconPositions }; if (Number.isFinite(params.x) && Number.isFinite(params.y)) iconPositions[appId] = { x: Math.max(0, Number(params.x)), y: Math.max(0, Number(params.y)) }; await kernel.settings({ desktopShortcuts: [...new Set([...s.desktopShortcuts, appId])], iconPositions }); }
            if (method === 'desktop.removeShortcut') await kernel.settings({ desktopShortcuts: s.desktopShortcuts.filter(x => x !== appId) });
            result = true; break;
          }
          case 'apps.list': permission('desktop:read'); result = osStore.getState().packages.map(p => ({ id: p.manifest.id, name: p.manifest.name, version: p.manifest.version, type: p.manifest.type, builtin: p.builtin, permissions: p.manifest.permissions })); break;
          case 'apps.launch': permission('apps:launch'); await kernel.launch(String(params.appId || '')); result = true; break;
          case 'apps.uninstall': { permission('apps:manage'); const appId = String(params.appId || ''); const pkg = kernel.packages.get(appId); if (!pkg) throw new Error('App is not installed.'); if (pkg.builtin) throw new Error('Built-in apps cannot be uninstalled.'); const ok = await dialog({ title: `Uninstall ${pkg.manifest.name}?`, message: `${pkg.manifest.name} requested permission to remove itself. Files it created are kept.`, danger: true, confirmLabel: 'Uninstall' }); if (!ok) throw new Error('Uninstall cancelled.'); await kernel.packages.uninstall(appId); result = true; break; }
          default: throw new Error('Unknown OS API.');
        }
      } catch (e) { error = (e as Error).message; }
      frame.current?.contentWindow?.postMessage({ channel: 'netronim:response', id, result, error }, '*');
    };
    window.addEventListener('message', handler); return () => window.removeEventListener('message', handler);
  }, [pkg, token, process.id, win.appId]);
  if (!pkg) return <ErrorNotice>This application is no longer installed.</ErrorNotice>;
  if (error) return <div className="padded"><ErrorNotice>{error}</ErrorNotice></div>;
  if (!html) return <Loading label={`Opening ${pkg.manifest.name}…`}/>;
  return <iframe ref={frame} className="html5view" title={pkg.manifest.name} srcDoc={html} sandbox="allow-scripts allow-forms allow-downloads" allow="camera; microphone; fullscreen" referrerPolicy="no-referrer"/>;
}
