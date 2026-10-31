import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { FolderPlus, FilePlus2, Upload, Settings2, RotateCw, Image, SquareTerminal, ClipboardPaste, ArrowUpRight, HardDrive, MousePointer2 } from 'lucide-react';
import { kernel } from '../kernel/kernel';
import { useOS } from '../kernel/store';
import { AppIcon, FileIcon, Logo } from './Icon';
import { WindowFrame } from './WindowFrame';
import { dialog, uniquePath } from '../kernel/utils';
import { reportError } from '../apps/hooks';
export function Desktop({ openStart }: { openStart: () => void }) {
  const state = useOS(); const scale = state.settings.uiScale / 100; const [selected, setSelected] = useState(''); const [menu, setMenu] = useState<{ x: number; y: number } | null>(null); const [dropping, setDropping] = useState(false); const dragDepth = useRef(0);
  const iconDrag = useRef<{ id: string; x: number; y: number; originalX: number; originalY: number; moved: boolean } | null>(null);
  const pinned = ['files','browser','terminal','notebook','sketchbook','canvas','settings'];
  const icons = [...pinned.map(id => ({ id, name: kernel.packages.get(id)?.manifest.name || id, icon: kernel.packages.get(id)?.manifest.icon || 'AppWindow', color: kernel.packages.get(id)?.manifest.color || '#b7a3f7', app: true })), ...state.packages.filter(p => !p.builtin).map(p => ({ id: p.manifest.id, name: p.manifest.name, icon: p.manifest.icon, color: p.manifest.color, app: true })), ...state.files.filter(f => f.parent === '/Home/Desktop').map(f => ({ id: f.path, name: f.name, icon: f.type === 'directory' ? 'Folder' : 'FileText', color: '#e8be78', app: false }))];
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click',close); window.addEventListener('blur',close); return () => { window.removeEventListener('click',close); window.removeEventListener('blur',close); }; }, []);
  const action = async (kind: string) => {
    setMenu(null);
    try {
      if (kind === 'folder' || kind === 'file') { const name = await dialog({ title: kind === 'folder' ? 'New folder' : 'New text file', label: 'Name', value: kind === 'folder' ? 'New folder' : 'Untitled.txt', input: true, confirmLabel: 'Create' }); if (!name?.trim()) return; const path = uniquePath('/Home/Desktop/' + name.trim(), p => !!kernel.fs.node(p)); if (kind === 'folder') await kernel.fs.mkdir(path); else await kernel.fs.write(path,''); }
      if (kind === 'import') document.dispatchEvent(new CustomEvent('netronim:import'));
      if (kind === 'paste' && state.fileClipboard) for (const path of state.fileClipboard.paths) await kernel.fs.copy(path,'/Home/Desktop/' + path.split('/').pop(),state.fileClipboard.cut);
      if (kind === 'settings' || kind === 'wallpaper') { await kernel.launch('settings', kind === 'wallpaper' ? 'display' : undefined); }
      if (kind === 'terminal') await kernel.launch('terminal');
      if (kind === 'refresh') { await kernel.fs.init(); kernel.bus.emit('desktop:refresh'); kernel.notify('Desktop refreshed','Your workspace is up to date.'); }
    } catch (e) { reportError(e); }
  };
  const iconDown = (e: ReactPointerEvent, id: string, x: number, y: number) => { if (e.button !== 0) return; e.stopPropagation(); setSelected(id); iconDrag.current = { id, x: e.clientX / scale, y: e.clientY / scale, originalX: x, originalY: y, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const iconMove = (e: ReactPointerEvent) => { const d = iconDrag.current; if (!d) return; const dx = e.clientX/scale-d.x, dy = e.clientY/scale-d.y; if (Math.abs(dx)+Math.abs(dy)>5) d.moved = true; if (d.moved) { const el = e.currentTarget as HTMLElement; el.style.left = `${Math.max(0,Math.min(innerWidth/scale-95,d.originalX+dx))}px`; el.style.top = `${Math.max(0,Math.min(innerHeight/scale-155,d.originalY+dy))}px`; } };
  const iconUp = async (e: ReactPointerEvent) => { const d = iconDrag.current; if (!d) return; if (d.moved) { const el = e.currentTarget as HTMLElement; await kernel.settings({ iconPositions: { ...state.settings.iconPositions, [d.id]: { x: parseInt(el.style.left), y: parseInt(el.style.top) } } }); } iconDrag.current = null; };
  return <main className={`desktop ${state.settings.theme}`} style={{ '--accent': state.settings.accent } as CSSProperties}
    onContextMenu={e => { if ((e.target as HTMLElement).closest('.os-window,.taskbar,.start-menu')) return; e.preventDefault(); setMenu({ x: Math.min(e.clientX/scale,innerWidth/scale-240), y: Math.min(e.clientY/scale,innerHeight/scale-365) }); }}
    onClick={e => { if (!(e.target as HTMLElement).closest('.desktop-icon,.context-menu')) setSelected(''); }}
    onDragEnter={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth.current++; setDropping(true); } }} onDragOver={e => e.preventDefault()} onDragLeave={() => { dragDepth.current--; if (dragDepth.current<=0) setDropping(false); }} onDrop={async e => { e.preventDefault(); setDropping(false); dragDepth.current=0; try { const paths = await kernel.media.import(Array.from(e.dataTransfer.files),'/Home/Desktop'); kernel.notify('Files imported',`${paths.length} file${paths.length===1?'':'s'} added to your desktop.`,'files'); } catch (error) { reportError(error); } }}>
    <img className="wallpaper" src={state.settings.wallpaper} alt="" draggable={false}/><div className="wallpaper-shade"/>
    <div className="desktop-brand"><Logo size={25}/><span>netronim <b>OS</b></span></div>
    <div className="desktop-widget"><span>{new Date().toLocaleDateString('en-US',{ weekday:'long' })}</span><h2>{new Date().toLocaleDateString('en-US',{ month:'long', day:'numeric' })}</h2><p>A little space. Endless possibility.</p></div>
    {state.settings.showDesktopIcons && <div className="desktop-icons">{icons.map((icon,i) => { const x = state.settings.iconPositions[icon.id]?.x ?? 24 + Math.floor(i/7)*104; const y = state.settings.iconPositions[icon.id]?.y ?? 76 + (i%7)*94; return <button key={icon.id} className={`desktop-icon ${selected===icon.id?'selected':''}`} style={{ left:x,top:y }} title={`Open ${icon.name}`} onDoubleClick={() => icon.app ? kernel.launch(icon.id).catch(reportError) : kernel.openFile(icon.id).catch(reportError)} onKeyDown={e => e.key==='Enter' && (icon.app ? kernel.launch(icon.id).catch(reportError) : kernel.openFile(icon.id).catch(reportError))} onPointerDown={e => iconDown(e,icon.id,x,y)} onPointerMove={iconMove} onPointerUp={iconUp} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelected(icon.id); setMenu({ x:Math.min(e.clientX/scale,innerWidth/scale-240),y:Math.min(e.clientY/scale,innerHeight/scale-365) }); }}>{icon.app ? <AppIcon name={icon.icon} color={icon.color} size={49}/> : <FileIcon kind={kernel.fs.node(icon.id)?.kind || 'text'} name={icon.name} size={44}/>}<span>{icon.name}</span></button>; })}</div>}
    <div className="desktop-note"><span className="desktop-note-dot"/><span>YOUR OWN LITTLE UNIVERSE</span><span className="desktop-version">1.0.0</span></div>
    {state.windows.map(win => <WindowFrame key={win.id} win={win}/>)}
    {menu && <div className="context-menu" style={{ left:menu.x,top:menu.y }} onClick={e => e.stopPropagation()}><span className="menu-caption">DESKTOP</span><button onClick={() => action('folder')}><FolderPlus size={16}/>New folder</button><button onClick={() => action('file')}><FilePlus2 size={16}/>New text file</button><button onClick={() => action('import')}><Upload size={16}/>Import files…</button><button disabled={!state.fileClipboard} onClick={() => action('paste')}><ClipboardPaste size={16}/>Paste</button><hr/><button onClick={() => action('wallpaper')}><Image size={16}/>Change wallpaper</button><button onClick={() => action('settings')}><Settings2 size={16}/>Desktop settings</button><button onClick={() => action('terminal')}><SquareTerminal size={16}/>Open Terminal</button><hr/><button onClick={() => action('refresh')}><RotateCw size={16}/>Refresh<span className="shortcut">F5</span></button></div>}
    {dropping && <div className="drop-overlay"><div><Upload size={42}/><h2>Drop it into your world.</h2><p>Images, video, audio, packages, and files.</p><small>Media is optimized automatically. Originals are {state.settings.keepOriginals?'kept':'not kept unless enabled in Settings'}.</small></div></div>}
  </main>;
}
