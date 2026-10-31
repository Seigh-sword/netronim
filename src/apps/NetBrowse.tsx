import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Home, Plus, X, Star, History, Download, ShieldCheck, Search, Globe2, LockKeyhole, ExternalLink, BookOpen, WifiOff, Zap } from 'lucide-react';
import { kernel } from '../kernel/kernel';
import { osStore } from '../kernel/store';
import { useStoredState, reportError } from './hooks';
import { uid, safeURL, download, basename } from '../kernel/utils';
import { Button } from '../components/ui';
import { AppIcon } from '../components/Icon';

type BrowseMode = 'direct' | 'reader';
interface BrowserTab { id: string; url: string; title: string; history: string[]; index: number; mode?: BrowseMode }
interface Page { html: string; url: string; title: string }
const newTab = (): BrowserTab => ({ id: uid(), url: 'about:home', title: 'New tab', history: ['about:home'], index: 0, mode: 'direct' });
const modeOf = (tab?: BrowserTab): BrowseMode => tab?.mode === 'reader' ? 'reader' : 'direct';
const SPEED_DIAL = [
  { name: 'Wikipedia', description: 'A world of knowledge', url: 'https://en.wikipedia.org/wiki/Main_Page', icon: 'BookOpen', color: '#bdc8df' },
  { name: 'MDN Web Docs', description: 'Build for the open web', url: 'https://developer.mozilla.org/en-US/', icon: 'Code2', color: '#8ebaf6' },
  { name: 'Hacker News', description: 'A little food for thought', url: 'https://news.ycombinator.com/', icon: 'Newspaper', color: '#e6a18b' },
  { name: 'Internet Archive', description: 'Explore the web’s memory', url: 'https://archive.org/', icon: 'Library', color: '#b7a3f7' },
  { name: 'GitHub', description: 'Where ideas become code', url: 'https://github.com/', icon: 'Code2', color: '#a8c79b' },
  { name: 'Example.com', description: 'A simple place to start', url: 'https://example.com/', icon: 'Globe2', color: '#8ed6b2' },
];

export default function NetBrowse() {
  const [data, setData, ready] = useStoredState('netbrowse', { tabs: [newTab()] as BrowserTab[], active: '', bookmarks: [{ title: 'Wikipedia', url: SPEED_DIAL[0].url }, { title: 'MDN Web Docs', url: SPEED_DIAL[1].url }] as { title: string; url: string }[], history: [] as { title: string; url: string; time: number }[], downloads: [] as { name: string; url: string; time: number }[] });
  const [address, setAddress] = useState(''); const [pages, setPages] = useState<Record<string, Page>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({}); const [errors, setErrors] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<'bookmarks' | 'history' | 'downloads' | null>(null); const [showHint, setShowHint] = useState(true);
  const input = useRef<HTMLInputElement>(null); const frame = useRef<HTMLIFrameElement>(null);
  const dataRef = useRef(data); dataRef.current = data;
  const controllers = useRef(new Map<string, AbortController>()); const attempted = useRef(new Set<string>());
  const tab = data.tabs.find(t => t.id === data.active) || data.tabs[0];
  const mode = modeOf(tab); const page = tab ? pages[tab.id] : undefined;
  const busy = tab ? loading[tab.id] : false; const error = tab ? errors[tab.id] : '';
  useEffect(() => { if (ready && tab) { setAddress(tab.url === 'about:home' ? '' : tab.url); if (tab.url !== 'about:home' && modeOf(tab) === 'reader' && !pages[tab.id] && !attempted.current.has(tab.id + tab.url)) { attempted.current.add(tab.id + tab.url); void load(tab.id, tab.url, 'restore'); } } }, [ready, tab?.id, tab?.url, tab?.mode]);
  useEffect(() => () => { controllers.current.forEach(c => c.abort()); }, []);
  const updateTab = (id: string, patch: Partial<BrowserTab>) => setData(d => ({ ...d, tabs: d.tabs.map(t => t.id === id ? { ...t, ...patch } : t) }));
  const recordHistory = (id: string, url: string, title: string, histMode: 'push' | 'replace' | 'restore') => setData(d => {
    const current = d.tabs.find(t => t.id === id); if (!current) return d;
    let history = [...current.history], index = current.index;
    if (histMode === 'push' && current.history[current.index] !== url) { history = [...history.slice(0, index + 1), url]; index = history.length - 1; }
    else if (histMode === 'replace') history[index] = url;
    return { ...d, tabs: d.tabs.map(t => t.id === id ? { ...t, url, title, history: history.slice(-100), index: Math.min(index, 99) } : t), history: [{ title, url, time: Date.now() }, ...d.history.filter(h => h.url !== url)].slice(0, 300) };
  });

  async function load(id: string, inputURL: string, histMode: 'push' | 'replace' | 'restore' = 'push', forceMode?: BrowseMode) {
    let url = inputURL; try { if (url !== 'about:home') url = safeURL(url); } catch (e) { setErrors(s => ({ ...s, [id]: (e as Error).message })); return; }
    const currentTab = dataRef.current.tabs.find(t => t.id === id); const browseMode = forceMode || modeOf(currentTab);
    if (url === 'about:home') { updateTab(id, { url, title: 'New tab' }); setPages(p => { const next = { ...p }; delete next[id]; return next; }); setErrors(e => ({ ...e, [id]: '' })); if (dataRef.current.active === id) setAddress(''); return; }
    setErrors(e => ({ ...e, [id]: '' }));
    if (browseMode === 'direct') {
      // Direct mode is a real embedded browser document: the remote site’s own JS/CSS run.
      // Netronim cannot bypass X-Frame-Options/CSP/anti-bot rules; the UI offers fallbacks.
      const title = new URL(url).hostname; recordHistory(id, url, title, histMode);
      setPages(p => { const next = { ...p }; delete next[id]; return next; });
      setLoading(l => ({ ...l, [id]: true })); if (dataRef.current.active === id) setAddress(url);
      setTimeout(() => setLoading(l => ({ ...l, [id]: false })), 2500); return;
    }
    controllers.current.get(id)?.abort(); const controller = new AbortController(); controllers.current.set(id, controller);
    setLoading(l => ({ ...l, [id]: true }));
    try {
      const endpoint = osStore.getState().settings.proxyEndpoint;
      const response = await fetch(`${endpoint}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(22000)]) });
      const result = await response.json(); if (controller.signal.aborted) return;
      if (!response.ok) { const hint = response.status === 429 ? ' The site rate-limited the reader proxy. Try Direct mode, wait a moment, or open the site externally.' : ''; throw new Error((result.error || 'The website proxy is unavailable.') + hint); }
      if (result.download) {
        const fileResponse = await fetch(result.url, { signal: controller.signal }); if (!fileResponse.ok) throw new Error('Download failed.');
        const blob = await fileResponse.blob(); if (controller.signal.aborted) return;
        const originalURL = timeURL(result.url); const name = (decodeURIComponent(basename(new URL(originalURL).pathname) || result.title || 'download')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || 'download';
        await kernel.fs.write('/Home/Downloads/' + name, blob, result.mime); download(blob, name, result.mime);
        setData(d => ({ ...d, downloads: [{ name, url: originalURL, time: Date.now() }, ...d.downloads].slice(0, 100) }));
        kernel.notify('Download complete', `${name} is saved in System Files and sent to your computer.`, 'files'); setLoading(l => ({ ...l, [id]: false })); return;
      }
      const title = String(result.title || new URL(url).hostname).slice(0, 150);
      setPages(p => ({ ...p, [id]: { html: result.html, url: result.url, title } }));
      if (dataRef.current.active === id) setAddress(result.url); recordHistory(id, result.url, title, histMode === 'push' ? 'push' : histMode);
    } catch (e) { if ((e as Error).name !== 'AbortError') { attempted.current.delete(id + url); setErrors(s => ({ ...s, [id]: (e as Error).message })); } }
    finally { if (controllers.current.get(id) === controller) { controllers.current.delete(id); setLoading(l => ({ ...l, [id]: false })); } }
  }
  const navigate = (value: string) => { if (!tab) return; let url = value.trim(); if (!url) return; if (url !== 'about:home' && !/^https?:\/\//i.test(url) && (!/^[^\s]+\.[^\s]{2,}$/.test(url) || /\s/.test(url))) url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(url); void load(tab.id, url); };
  const createTab = () => { if (data.tabs.length >= 12) { reportError(new Error('This browser supports up to 12 tabs.')); return; } const t = newTab(); setData(d => ({ ...d, tabs: [...d.tabs, t], active: t.id })); setAddress(''); setTimeout(() => input.current?.focus(), 30); };
  const closeTab = (id: string) => { controllers.current.get(id)?.abort(); controllers.current.delete(id); setData(d => { const tabs = d.tabs.filter(t => t.id !== id); return { ...d, tabs: tabs.length ? tabs : [newTab()], active: d.active === id ? (tabs.at(-1)?.id || '') : d.active }; }); setPages(p => { const n = { ...p }; delete n[id]; return n; }); };
  const travel = (direction: number) => { if (!tab) return; const index = tab.index + direction; const url = tab.history[index]; if (url === undefined) return; updateTab(tab.id, { index, url }); setErrors(e => ({ ...e, [tab.id]: '' })); if (url === 'about:home') { setPages(p => { const n = { ...p }; delete n[tab.id]; return n; }); setAddress(''); } else void load(tab.id, url, 'restore'); };
  const switchMode = (next: BrowseMode) => { if (!tab) return; updateTab(tab.id, { mode: next }); setErrors(e => ({ ...e, [tab.id]: '' })); if (tab.url !== 'about:home') void load(tab.id, tab.url, 'replace', next); };
  useEffect(() => { const message = (e: MessageEvent) => { if (e.source !== frame.current?.contentWindow || !tab) return; if (e.data?.channel === 'netbrowse:navigate' && typeof e.data.url === 'string') void load(tab.id, e.data.url); if (e.data?.channel === 'netbrowse:message') kernel.notify('NetBrowse reader', String(e.data.message), 'browser'); }; window.addEventListener('message', message); return () => window.removeEventListener('message', message); }, [tab?.id]);
  const bookmarked = tab && data.bookmarks.some(b => b.url === tab.url);
  return <div className="app browser-app">
    <div className="browser-tabs"><Globe2 size={15} className="browser-tab-logo" />{data.tabs.map(t => <div key={t.id} className={`browser-tab ${t.id === tab?.id ? 'active' : ''}`} onClick={() => setData(d => ({ ...d, active: t.id }))}><span className={`browser-tab-favicon ${loading[t.id] ? 'spin' : ''}`}>{loading[t.id] ? <RotateCw size={12} /> : <Globe2 size={12} />}</span><span className="truncate">{t.title}</span><button aria-label={`Close ${t.title}`} onClick={e => { e.stopPropagation(); closeTab(t.id); }}><X size={12} /></button></div>)}<button className="icon-btn" title="New tab" onClick={createTab}><Plus size={16} /></button><span className="spacer" /><span className="browser-mode-label">{mode === 'direct' ? <><Zap size={11} />Direct browser</> : <><ShieldCheck size={11} />Reader proxy</>}</span></div>
    <div className="toolbar browser-navigation"><button className="icon-btn" title="Back" disabled={!tab || tab.index === 0} onClick={() => travel(-1)}><ArrowLeft size={17} /></button><button className="icon-btn" title="Forward" disabled={!tab || tab.index >= tab.history.length - 1} onClick={() => travel(1)}><ArrowRight size={17} /></button><button className="icon-btn" title="Reload" onClick={() => tab && load(tab.id, tab.url, 'replace')}><RotateCw size={15} className={busy ? 'spin' : ''} /></button><button className="icon-btn" title="Home" onClick={() => tab && load(tab.id, 'about:home')}><Home size={16} /></button><form className="browser-address" onSubmit={e => { e.preventDefault(); navigate(address); }}>{tab?.url.startsWith('https:') ? <LockKeyhole size={13} /> : <Search size={14} />}<input ref={input} aria-label="Address bar" placeholder="Search the web or enter an address" value={address} onFocus={e => e.target.select()} onChange={e => setAddress(e.target.value)} />{busy && <span className="address-loading" />}<kbd>↵</kbd></form><div className="browser-mode-switch" role="group" aria-label="Browsing mode"><button className={mode === 'direct' ? 'active' : ''} onClick={() => switchMode('direct')} title="Run the site’s own JavaScript and CSS in an embedded browser frame"><Zap size={13} />Direct</button><button className={mode === 'reader' ? 'active' : ''} onClick={() => switchMode('reader')} title="Server-side reader proxy; scripts disabled for safety"><ShieldCheck size={13} />Reader</button></div><button className={`icon-btn ${bookmarked ? 'starred' : ''}`} title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'} disabled={!tab || tab.url === 'about:home'} onClick={() => setData(d => ({ ...d, bookmarks: bookmarked ? d.bookmarks.filter(b => b.url !== tab.url) : [...d.bookmarks, { title: tab!.title, url: tab!.url }] }))}><Star size={17} fill={bookmarked ? 'currentColor' : 'none'} /></button><span className="toolbar-separator" /><button className={`icon-btn ${panel === 'bookmarks' ? 'active' : ''}`} title="Bookmarks" onClick={() => setPanel(panel === 'bookmarks' ? null : 'bookmarks')}><BookOpen size={16} /></button><button className={`icon-btn ${panel === 'history' ? 'active' : ''}`} title="History" onClick={() => setPanel(panel === 'history' ? null : 'history')}><History size={16} /></button><button className={`icon-btn ${panel === 'downloads' ? 'active' : ''}`} title="Downloads" onClick={() => setPanel(panel === 'downloads' ? null : 'downloads')}><Download size={16} /></button></div>
    {busy && <div className="browser-loading-bar"><span /></div>}
    <div className="app-columns browser-content">{panel && <aside className="browser-panel"><div className="layers-heading"><h3>{panel[0].toUpperCase() + panel.slice(1)}</h3><button className="icon-btn" title="Close panel" onClick={() => setPanel(null)}><X size={15} /></button></div>{panel === 'bookmarks' && data.bookmarks.map(b => <div className="browser-panel-item" key={b.url}><button onClick={() => { if (tab) load(tab.id, b.url); }}><Globe2 size={15} /><span><strong>{b.title}</strong><small>{new URL(b.url).hostname}</small></span></button><button className="icon-btn" title="Remove bookmark" onClick={() => setData(d => ({ ...d, bookmarks: d.bookmarks.filter(x => x.url !== b.url) }))}><X size={12} /></button></div>)}{panel === 'history' && <><button className="text-button" onClick={() => setData(d => ({ ...d, history: [] }))}>Clear browsing history</button>{data.history.map(h => <div className="browser-panel-item" key={h.url}><button onClick={() => tab && load(tab.id, h.url)}><History size={15} /><span><strong>{h.title}</strong><small>{new Date(h.time).toLocaleString()}</small></span></button></div>)}</>}{panel === 'downloads' && data.downloads.map((d, i) => <div className="browser-panel-item" key={i}><button onClick={() => kernel.launch('files', '/Home/Downloads').catch(reportError)}><Download size={15} /><span><strong>{d.name}</strong><small>{new Date(d.time).toLocaleString()}</small></span></button></div>)}{panel !== 'bookmarks' && !data[panel].length && <p className="browser-panel-empty">Nothing here yet. A little exploring will fix that.</p>}</aside>}
      <div className="browser-page">{error ? <div className="browser-error"><span className="browser-error-icon"><WifiOff size={35} /></span><span className="eyebrow">A SMALL DETOUR</span><h1>This page took another path.</h1><p>{error}</p><div className="browser-error-help"><ShieldCheck size={18} /><p>{mode === 'reader' ? 'Reader mode proxies and sanitizes pages, so scripts/sign-in/anti-bot checks may fail. Direct mode runs the site normally when embedding is allowed.' : 'Direct mode cannot bypass a site’s frame policy, CORS, or anti-bot rules. Try Reader mode or open the site in a full browser tab.'}</p></div><div className="flex gap-2"><Button variant="primary" onClick={() => tab && load(tab.id, tab.url, 'replace')}><RotateCw size={14} />Try again</Button><Button onClick={() => switchMode(mode === 'direct' ? 'reader' : 'direct')}>{mode === 'direct' ? <ShieldCheck size={14} /> : <Zap size={14} />}Try {mode === 'direct' ? 'Reader' : 'Direct'} mode</Button><Button onClick={() => tab && window.open(tab.url, '_blank', 'noopener,noreferrer')}><ExternalLink size={14} />Open externally</Button></div></div>
        : mode === 'direct' && tab && tab.url !== 'about:home' ? <div className="browser-direct"><iframe key={tab.id + tab.url} ref={frame} title={`NetBrowse: ${tab.title}`} src={tab.url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation" allow="fullscreen; clipboard-read; clipboard-write" referrerPolicy="no-referrer-when-downgrade" onLoad={() => setLoading(l => ({ ...l, [tab.id]: false }))} />{showHint && <div className="browser-direct-hint"><Zap size={13} /><span>Direct mode runs the site’s own JS/CSS. Blank page? The site blocks embedding — try Reader or open externally.</span><button className="icon-btn" aria-label="Dismiss hint" onClick={() => setShowHint(false)}><X size={12} /></button></div>}</div>
        : page && tab ? <iframe ref={frame} title={`NetBrowse: ${tab.title}`} srcDoc={page.html} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" />
        : tab?.url !== 'about:home' && busy ? <div className="browser-page-loading"><Globe2 size={35} className="spin" /><p>Opening a little window onto the web…</p></div>
        : <div className="browser-home"><div className="browser-home-orbit"><Globe2 size={35} strokeWidth={1.1} /></div><span className="eyebrow">THE OPEN WEB, A LITTLE CLOSER</span><h1>Where will you wander?</h1><p>Direct mode for real JS/CSS. Reader mode for a calmer, proxied page.</p><form className="browser-home-search" onSubmit={e => { e.preventDefault(); navigate(address); }}><Search size={19} /><input aria-label="Search the web" placeholder="Search the web…" value={address} onChange={e => setAddress(e.target.value)} /><button aria-label="Search"><ArrowRight size={19} /></button></form><div className="browser-speed-dial">{SPEED_DIAL.map(site => <button key={site.url} onClick={() => tab && load(tab.id, site.url)}><AppIcon name={site.icon} color={site.color} size={41} /><strong>{site.name}</strong><span>{site.description}</span></button>)}</div><div className="browser-reader-note"><ShieldCheck size={17} /><div><strong>Two honest ways to browse.</strong><p>Direct embeds the live site. Reader proxies it with scripts disabled. Neither can override a site’s security policy.</p></div></div></div>}</div></div>
    <footer className="statusbar"><ShieldCheck size={11} /><span>{mode === 'direct' ? 'Direct mode · site JS/CSS enabled · embedding policies still apply' : 'Reader mode · no remote scripts · no cookies forwarded'}</span><span className="spacer" /><span>{data.tabs.length} tab{data.tabs.length === 1 ? '' : 's'}</span>{tab && tab.url !== 'about:home' && <span className="truncate" style={{ maxWidth: 220 }}>{tab.url}</span>}</footer>
  </div>;
}
function timeURL(url: string) { try { return new URL(url, new URL(osStore.getState().settings.proxyEndpoint, location.href)).searchParams.get('url') || url; } catch { return url; } }
