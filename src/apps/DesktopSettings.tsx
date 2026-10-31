import { useRef, useState } from 'react';
import { Download, Upload, Plus, Trash2, Pin, AppWindow, Copy, Check } from 'lucide-react';
import { kernel } from '../kernel/kernel';
import { useOS } from '../kernel/store';
import { Button, Toggle, Field, ErrorNotice } from '../components/ui';
import { AppIcon } from '../components/Icon';
import { desktopToXML, parseDesktopXML } from '../kernel/desktop';
import { download, dialog } from '../kernel/utils';
import { reportError } from './hooks';

const RONIM_SNIPPET = `<script src="assets/ronim.js"></script>
<script type="module">
  import { desktop, apps } from './assets/ronim.js';
  await desktop.set({ taskbar: { glass: true, opacity: 70, blur: 30 } });
  await desktop.applyXML('<netronim-desktop version="1">…</netronim-desktop>');
  await apps.launch('terminal');
</script>`;

export default function DesktopSettings() {
  const state = useOS(); const settings = state.settings; const taskbar = settings.taskbar;
  const [error, setError] = useState(''); const [copied, setCopied] = useState(false);
  const xmlInput = useRef<HTMLInputElement>(null);
  const setTaskbar = (patch: Partial<typeof taskbar>) => kernel.settings({ taskbar: { ...taskbar, ...patch } });
  const row = (title: string, description: string, control: React.ReactNode) => <div className="settings-row"><div><strong>{title}</strong><p>{description}</p></div>{control}</div>;
  const slider = (label: string, value: number, min: number, max: number, onChange: (v: number) => void, unit = '') => <div className="settings-slider"><input aria-label={label} type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /><span>{value}{unit}</span></div>;
  const removeShortcut = (id: string) => kernel.settings({ desktopShortcuts: settings.desktopShortcuts.filter(x => x !== id) });
  const unpin = (id: string) => kernel.settings({ taskbarPinned: settings.taskbarPinned.filter(x => x !== id) });
  const addApp = async (target: 'desktop' | 'taskbar') => { const id = await dialog({ title: target === 'desktop' ? 'Add desktop shortcut' : 'Pin app to taskbar', label: 'App ID', input: true, placeholder: 'terminal', confirmLabel: 'Add' }); if (!id) return; if (!kernel.packages.get(id)) { setError(`No installed app with ID “${id}”.`); return; } if (target === 'desktop') await kernel.settings({ desktopShortcuts: [...new Set([...settings.desktopShortcuts, id])] }); else await kernel.settings({ taskbarPinned: [...new Set([...settings.taskbarPinned, id])] }); };
  const uninstall = async (id: string) => { const pkg = kernel.packages.get(id); if (!pkg || pkg.builtin) return; if (await dialog({ title: `Uninstall ${pkg.manifest.name}?`, message: 'The app will be removed. Files you created are kept.', danger: true, confirmLabel: 'Uninstall' })) await kernel.packages.uninstall(id); };
  const appList = (ids: string[], kind: 'desktop' | 'taskbar') => <div className="desktop-app-list">{ids.map(id => { const pkg = kernel.packages.get(id); if (!pkg) return null; return <div className="installed-app-row" key={id}><AppIcon name={pkg.manifest.icon} color={pkg.manifest.color} size={30} /><div><strong>{pkg.manifest.name}</strong><p>{pkg.manifest.id}</p></div><button className="icon-btn" title="Open" onClick={() => kernel.launch(id).catch(reportError)}><AppWindow size={15} /></button><button className="icon-btn" title={kind === 'desktop' ? 'Remove from desktop' : 'Unpin'} onClick={() => kind === 'desktop' ? removeShortcut(id) : unpin(id)}><Trash2 size={15} /></button>{!pkg.builtin && <button className="icon-btn" title="Uninstall app" onClick={() => uninstall(id)}><Trash2 size={15} /></button>}</div>; })}{!ids.length && <p className="muted">Nothing here yet. Drag an app from Start, or add one by ID.</p>}</div>;
  return <div className="desktop-settings">
    <p className="settings-intro">Glass, layout, shortcuts, and XML — make the desktop actually yours.</p>
    {error && <ErrorNotice>{error}</ErrorNotice>}
    <h3 className="settings-section-title">Taskbar</h3>
    <div className="settings-group">
      {row('Position', 'Put the taskbar where your muscle memory expects it.', <select aria-label="Taskbar position" value={taskbar.position} onChange={e => setTaskbar({ position: e.target.value as 'top' | 'bottom' })}><option value="bottom">Bottom</option><option value="top">Top</option></select>)}
      {row('Glass', 'Translucent taskbar with live blur.', <Toggle label="Taskbar glass" checked={taskbar.glass} onChange={v => setTaskbar({ glass: v })} />)}
      {row('Opacity', 'How much of the wallpaper shows through.', slider('Taskbar opacity', taskbar.opacity, 15, 100, v => setTaskbar({ opacity: v }), '%'))}
      {row('Blur', 'Frosted-glass strength.', slider('Taskbar blur', taskbar.blur, 0, 48, v => setTaskbar({ blur: v }), 'px'))}
      {row('Icon size', 'Scale taskbar app icons.', slider('Taskbar icon size', taskbar.iconSize, 24, 52, v => setTaskbar({ iconSize: v }), 'px'))}
      {row('Alignment', 'Center the app rail or keep it left.', <select aria-label="Taskbar alignment" value={taskbar.align} onChange={e => setTaskbar({ align: e.target.value as 'left' | 'center' })}><option value="center">Center</option><option value="left">Left</option></select>)}
      {row('Auto-hide', 'Reveal the taskbar when the pointer reaches its edge.', <Toggle label="Auto-hide taskbar" checked={taskbar.autoHide} onChange={v => setTaskbar({ autoHide: v })} />)}
      {row('Search button', 'Show the Start search shortcut.', <Toggle label="Show search" checked={taskbar.showSearch} onChange={v => setTaskbar({ showSearch: v })} />)}
      {row('Workspaces', 'Show the two virtual-desktop switchers.', <Toggle label="Show workspaces" checked={taskbar.showWorkspaces} onChange={v => setTaskbar({ showWorkspaces: v })} />)}
      {row('System tray', 'Show network, volume, and battery controls.', <Toggle label="Show tray" checked={taskbar.showTray} onChange={v => setTaskbar({ showTray: v })} />)}
    </div>
    <h3 className="settings-section-title">Desktop icons</h3>
    <div className="settings-group">
      {row('Show icons', 'Hide every desktop shortcut without deleting apps.', <Toggle label="Show desktop icons" checked={settings.showDesktopIcons} onChange={v => kernel.settings({ showDesktopIcons: v })} />)}
      {row('Labels', 'Show app names under icons.', <Toggle label="Show icon labels" checked={settings.desktopShowLabels} onChange={v => kernel.settings({ desktopShowLabels: v })} />)}
      {row('Icon size', 'Desktop shortcut icon size.', slider('Desktop icon size', settings.desktopIconSize, 28, 84, v => kernel.settings({ desktopIconSize: v }), 'px'))}
      {row('Grid spacing', 'Vertical spacing for auto-arranged icons.', slider('Desktop grid', settings.desktopGrid, 64, 160, v => kernel.settings({ desktopGrid: v }), 'px'))}
      <div className="settings-row"><div><strong>Arrange</strong><p>Reset custom icon positions to the grid.</p></div><Button onClick={() => kernel.settings({ iconPositions: {} })}>Auto-arrange</Button></div>
    </div>
    <h3 className="settings-section-title">Desktop shortcuts</h3>
    <div className="flex gap-2" style={{ marginBottom: 10 }}><Button onClick={() => addApp('desktop')}><Plus size={14} />Add app</Button></div>
    {appList(settings.desktopShortcuts, 'desktop')}
    <h3 className="settings-section-title">Pinned taskbar apps</h3>
    <div className="flex gap-2" style={{ marginBottom: 10 }}><Button onClick={() => addApp('taskbar')}><Pin size={14} />Pin app</Button></div>
    {appList(settings.taskbarPinned, 'taskbar')}
    <h3 className="settings-section-title">Desktop XML</h3>
    <p className="muted" style={{ marginBottom: 12 }}>Export your layout, edit it as XML, and import it back. XML can change appearance and layout only — it cannot execute code or change network endpoints.</p>
    <div className="flex gap-2"><Button variant="primary" onClick={() => download(new Blob([desktopToXML(settings)], { type: 'application/xml' }), 'netronim-desktop.xml')}><Download size={14} />Export XML</Button><Button onClick={() => xmlInput.current?.click()}><Upload size={14} />Import XML</Button></div>
    <input ref={xmlInput} type="file" accept=".xml,application/xml,text/xml" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { await kernel.settings(parseDesktopXML(await file.text())); setError(''); kernel.notify('Desktop XML applied', 'Your layout and appearance were updated.', 'settings'); } catch (err) { setError((err as Error).message); } }} />
    <h3 className="settings-section-title">ronim-js</h3>
    <p className="muted" style={{ marginBottom: 10 }}>Installed HTML5View apps can use the secure <code>ronim</code> bridge when their manifest declares <code>desktop:read</code>, <code>desktop:write</code>, <code>apps:launch</code>, or <code>apps:manage</code>.</p>
    <pre className="code-sample">{RONIM_SNIPPET}</pre>
    <Button onClick={async () => { await kernel.copy(RONIM_SNIPPET); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy snippet'}</Button>
  </div>;
}
