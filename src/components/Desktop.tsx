import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { FolderPlus, FilePlus2, Upload, Settings2, RotateCw, Image, SquareTerminal, ClipboardPaste, Pin, PinOff, Trash2, AppWindow, LayoutGrid, FileCode2 } from 'lucide-react';
import { kernel } from '../kernel/kernel';
import { useOS } from '../kernel/store';
import { AppIcon, FileIcon, Logo } from './Icon';
import { WindowFrame } from './WindowFrame';
import { dialog, uniquePath, download } from '../kernel/utils';
import { desktopToXML, parseDesktopXML } from '../kernel/desktop';
import { reportError } from '../apps/hooks';

interface DesktopIcon { id: string; name: string; icon: string; color: string; app: boolean; builtin?: boolean }
export function Desktop({ openStart }: { openStart: () => void }) {
  const state = useOS(); const scale = state.settings.uiScale / 100;
  const [selected, setSelected] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; icon?: DesktopIcon } | null>(null);
  const [dropping, setDropping] = useState(false); const dragDepth = useRef(0);
  const iconDrag = useRef<{ id: string; x: number; y: number; originalX: number; originalY: number; moved: boolean } | null>(null);
  const xmlInput = useRef<HTMLInputElement>(null);
  const settings = state.settings; const taskbar = settings.taskbar;
  const icons: DesktopIcon[] = [
    ...settings.desktopShortcuts.flatMap(id => { const p = kernel.packages.get(id); return p ? [{ id, name: p.manifest.name, icon: p.manifest.icon, color: p.manifest.color, app: true, builtin: p.builtin }] : []; }),
    ...state.files.filter(f => f.parent === '/Home/Desktop').map(f => ({ id: f.path, name: f.name, icon: f.type === 'directory' ? 'Folder' : 'FileText', color: '#e8be78', app: false })),
  ];
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); window.addEventListener('blur', close); return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); }; }, []);
  const addShortcut = async (id: string, x?: number, y?: number) => { if (!kernel.packages.get(id)) return; const desktopShortcuts = [...new Set([...settings.desktopShortcuts, id])]; const iconPositions = { ...settings.iconPositions }; if (x != null && y != null) iconPositions[id] = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) }; await kernel.settings({ desktopShortcuts, iconPositions }); };
  const pinTaskbar = async (id: string) => kernel.settings({ taskbarPinned: [...new Set([...settings.taskbarPinned, id])] });
  const removeShortcut = async (id: string) => kernel.settings({ desktopShortcuts: settings.desktopShortcuts.filter(x => x !== id) });
  const uninstall = async (id: string) => { const pkg = kernel.packages.get(id); if (!pkg || pkg.builtin) return; if (await dialog({ title: `Uninstall ${pkg.manifest.name}?`, message: 'The app will be removed from Netronim. Files you created are kept.', danger: true, confirmLabel: 'Uninstall' })) await kernel.packages.uninstall(id); };
  const action = async (kind: string) => {
    setMenu(null);
    try {
      if (kind === 'folder' || kind === 'file') { const name = await dialog({ title: kind === 'folder' ? 'New folder' : 'New text file', label: 'Name', value: kind === 'folder' ? 'New folder' : 'Untitled.txt', input: true, confirmLabel: 'Create' }); if (!name?.trim()) return; const path = uniquePath('/Home/Desktop/' + name.trim(), p => !!kernel.fs.node(p)); if (kind === 'folder') await kernel.fs.mkdir(path); else await kernel.fs.write(path, ''); }
      if (kind === 'import') document.dispatchEvent(new CustomEvent('netronim:import', { detail: '/Home/Desktop' }));
      if (kind === 'paste' && state.fileClipboard) for (const path of state.fileClipboard.paths) await kernel.fs.copy(path, '/Home/Desktop/' + path.split('/').pop(), state.fileClipboard.cut);
      if (kind === 'settings' || kind === 'wallpaper') await kernel.launch('settings', kind === 'wallpaper' ? 'display' : 'desktop');
      if (kind === 'terminal') await kernel.launch('terminal');
      if (kind === 'refresh') { await kernel.fs.init(); kernel.bus.emit('desktop:refresh'); }
      if (kind === 'arrange') await kernel.settings({ iconPositions: {} });
      if (kind === 'export-xml') download(new Blob([desktopToXML(settings)], { type: 'application/xml' }), 'netronim-desktop.xml');
      if (kind === 'import-xml') xmlInput.current?.click();
    } catch (e) { reportError(e); }
  };
  const iconDown = (e: ReactPointerEvent, id: string, x: number, y: number) => { if (e.button !== 0) return; e.stopPropagation(); setSelected(id); iconDrag.current = { id, x: e.clientX / scale, y: e.clientY / scale, originalX: x, originalY: y, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const iconMove = (e: ReactPointerEvent) => { const d = iconDrag.current; if (!d) return; const dx = e.clientX / scale - d.x, dy = e.clientY / scale - d.y; if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true; if (d.moved) { const el = e.currentTarget as HTMLElement; el.style.left = `${Math.max(0, Math.min(innerWidth / scale - 95, d.originalX + dx))}px`; el.style.top = `${Math.max(0, Math.min(innerHeight / scale - 155, d.originalY + dy))}px`; } };
  const iconUp = async (e: ReactPointerEvent) => { const d = iconDrag.current; if (!d) return; if (d.moved) { const el = e.currentTarget as HTMLElement; await kernel.settings({ iconPositions: { ...settings.iconPositions, [d.id]: { x: parseInt(el.style.left), y: parseInt(el.style.top) } } }); } iconDrag.current = null; };
  const openIcon = (icon: DesktopIcon) => (icon.app ? kernel.launch(icon.id) : kernel.openFile(icon.id)).catch(reportError);
  const cssVars = { '--accent': settings.accent, '--desktop-icon-size': `${settings.desktopIconSize}px`, '--desktop-grid': `${settings.desktopGrid}px`, '--taskbar-opacity': taskbar.opacity / 100, '--taskbar-blur': `${taskbar.blur}px`, '--taskbar-icon-size': `${taskbar.iconSize}px` } as CSSProperties;
  return <main className={`desktop ${settings.theme} taskbar-${taskbar.position} ${taskbar.autoHide ? 'taskbar-autohide' : ''}`} style={cssVars}
    onContextMenu={e => { if ((e.target as HTMLElement).closest('.os-window,.taskbar,.start-menu')) return; e.preventDefault(); setMenu({ x: Math.min(e.clientX / scale, innerWidth / scale - 250), y: Math.min(e.clientY / scale, innerHeight / scale - 420) }); }}
    onClick={e => { if (!(e.target as HTMLElement).closest('.desktop-icon,.context-menu')) setSelected(''); }}
    onDragEnter={e => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-netronim-app')) { e.preventDefault(); dragDepth.current++; setDropping(true); } }}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-netronim-app')) e.preventDefault(); }}
    onDragLeave={() => { dragDepth.current--; if (dragDepth.current <= 0) setDropping(false); }}
    onDrop={async e => { e.preventDefault(); setDropping(false); dragDepth.current = 0; try { const appId = e.dataTransfer.getData('application/x-netronim-app'); if (appId) { const rect = e.currentTarget.getBoundingClientRect(); await addShortcut(appId, (e.clientX - rect.left) / scale - 43, (e.clientY - rect.top) / scale - 42); return; } if (e.dataTransfer.files.length) { const paths = await kernel.media.import(Array.from(e.dataTransfer.files), '/Home/Desktop'); kernel.notify('Files imported', `${paths.length} file${paths.length === 1 ? '' : 's'} added to your desktop.`, 'files'); } } catch (error) { reportError(error); } }}>
    <img className="wallpaper" src={settings.wallpaper} alt="" draggable={false} onError={e => { e.currentTarget.style.display = 'none'; }} /><div className="wallpaper-shade" />
    <div className="desktop-brand"><Logo size={25} /><span>netronim <b>OS</b></span></div>
    <div className="desktop-widget"><span>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</span><h2>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</h2><p>A little space. Endless possibility.</p></div>
    {settings.showDesktopIcons && <div className="desktop-icons">{icons.map((icon, i) => { const columns = Math.max(1, Math.floor((innerHeight / scale - 140) / settings.desktopGrid)); const x = settings.iconPositions[icon.id]?.x ?? 24 + Math.floor(i / columns) * 104; const y = settings.iconPositions[icon.id]?.y ?? 76 + (i % columns) * settings.desktopGrid; return <button key={icon.id} className={`desktop-icon ${selected === icon.id ? 'selected' : ''} ${settings.desktopShowLabels ? '' : 'no-label'}`} style={{ left: x, top: y }} title={`Open ${icon.name}`} onDoubleClick={() => openIcon(icon)} onKeyDown={e => e.key === 'Enter' && openIcon(icon)} onPointerDown={e => iconDown(e, icon.id, x, y)} onPointerMove={iconMove} onPointerUp={iconUp} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSelected(icon.id); setMenu({ x: Math.min(e.clientX / scale, innerWidth / scale - 250), y: Math.min(e.clientY / scale, innerHeight / scale - 420), icon }); }}>{icon.app ? <AppIcon name={icon.icon} color={icon.color} size={settings.desktopIconSize} /> : <FileIcon kind={kernel.fs.node(icon.id)?.kind || 'text'} name={icon.name} size={settings.desktopIconSize - 5} />}{settings.desktopShowLabels && <span>{icon.name}</span>}</button>; })}</div>}
    <div className="desktop-note"><span className="desktop-note-dot" /><span>YOUR OWN LITTLE UNIVERSE</span><span className="desktop-version">1.0.0</span></div>
    {state.windows.map(win => <WindowFrame key={win.id} win={win} />)}
    {menu && <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}>{menu.icon ? <><span className="menu-caption">{menu.icon.name.toUpperCase()}</span><button onClick={() => { openIcon(menu.icon!); setMenu(null); }}><AppWindow size={16} />Open</button>{menu.icon.app && <><button onClick={() => { pinTaskbar(menu.icon!.id); setMenu(null); }}><Pin size={16} />Pin to taskbar</button><button onClick={() => { removeShortcut(menu.icon!.id); setMenu(null); }}><PinOff size={16} />Remove from desktop</button>{!menu.icon.builtin && <button onClick={() => { uninstall(menu.icon!.id); setMenu(null); }}><Trash2 size={16} />Uninstall app</button>}</>}{!menu.icon.app && <button onClick={async () => { await kernel.fs.trash(menu.icon!.id); setMenu(null); }}><Trash2 size={16} />Move to Trash</button>}</> : <><span className="menu-caption">DESKTOP</span><button onClick={() => action('folder')}><FolderPlus size={16} />New folder</button><button onClick={() => action('file')}><FilePlus2 size={16} />New text file</button><button onClick={() => action('import')}><Upload size={16} />Import files…</button><button disabled={!state.fileClipboard} onClick={() => action('paste')}><ClipboardPaste size={16} />Paste</button><hr /><button onClick={() => action('arrange')}><LayoutGrid size={16} />Auto-arrange icons</button><button onClick={() => action('wallpaper')}><Image size={16} />Change wallpaper</button><button onClick={() => action('settings')}><Settings2 size={16} />Desktop & taskbar settings</button><button onClick={() => action('export-xml')}><FileCode2 size={16} />Export desktop XML</button><button onClick={() => action('import-xml')}><Upload size={16} />Import desktop XML</button><button onClick={() => action('terminal')}><SquareTerminal size={16} />Open Terminal</button><hr /><button onClick={() => action('refresh')}><RotateCw size={16} />Refresh<span className="shortcut">F5</span></button></>}</div>}
    <input ref={xmlInput} type="file" accept=".xml,application/xml,text/xml" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { await kernel.settings(parseDesktopXML(await file.text())); kernel.notify('Desktop XML applied', 'Your layout and appearance were updated.', 'settings'); } catch (error) { reportError(error); } }} />
    {dropping && <div className="drop-overlay"><div><Upload size={42} /><h2>Drop it into your world.</h2><p>Apps become desktop shortcuts. Files are imported as native media.</p><small>Images are stored as .nif. Originals are {settings.keepOriginals ? 'kept' : 'not kept unless enabled in Settings'}.</small></div></div>}
  </main>;
}
