import { Component, Suspense, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import type { OSWindow, Rect } from '../kernel/types';
import { kernel } from '../kernel/kernel';
import { useOS } from '../kernel/store';
import { clamp } from '../kernel/utils';
import { appComponents } from '../apps/registry';
import { Icon, AppIcon } from './Icon';
import { Loading, ErrorNotice } from './ui';
import HTML5View from './HTML5View';
import WasmView from './WasmView';
class AppBoundary extends Component<{ children: ReactNode; appId: string }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error) { kernel.log(this.props.appId, error.message, 'error'); }
  render() { return this.state.error ? <div className="padded"><ErrorNotice>{this.state.error}</ErrorNotice><button className="btn" onClick={() => this.setState({ error: '' })}>Try again</button></div> : this.props.children; }
}
export function WindowFrame({ win }: { win: OSWindow }) {
  const state = useOS(); const ref = useRef<HTMLDivElement>(null); const drag = useRef<{ rect: Rect; startX: number; startY: number; mode: string; current: Rect } | null>(null);
  const [snap, setSnap] = useState<'left'|'right'|'top'|null>(null); const [interacting, setInteracting] = useState(false);
  const focused = state.focusedWindow === win.id; const pkg = kernel.packages.get(win.appId); const process = state.processes.find(p => p.id === win.processId);
  if (state.workspace !== win.workspace || !pkg || !process) return null;
  const area = kernel.windows.workArea; const scale = state.settings.uiScale / 100;
  const rect = win.maximized ? { x: 0, y: 0, width: area.width, height: area.height } : { x: clamp(win.x,0,Math.max(0,area.width-win.width)), y: clamp(win.y,0,Math.max(0,area.height-win.height)), width: Math.min(win.width,area.width), height: Math.min(win.height,area.height) };
  const begin = (e: ReactPointerEvent, mode: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    if (win.maximized && mode === 'move') return;
    e.preventDefault(); e.stopPropagation(); kernel.windows.focus(win.id);
    drag.current = { rect: { ...rect }, startX: e.clientX / scale, startY: e.clientY / scale, mode, current: { ...rect } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setInteracting(true);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX/scale-d.startX, dy = e.clientY/scale-d.startY; let next = { ...d.rect };
    if (d.mode === 'move') { next.x = clamp(d.rect.x+dx,0,area.width-next.width); next.y = clamp(d.rect.y+dy,0,area.height-next.height); setSnap(e.clientX/scale < 18 ? 'left' : e.clientX/scale > area.width-18 ? 'right' : e.clientY/scale < 12 ? 'top' : null); }
    else {
      if (d.mode.includes('e')) next.width = clamp(d.rect.width+dx,320,area.width-d.rect.x);
      if (d.mode.includes('s')) next.height = clamp(d.rect.height+dy,230,area.height-d.rect.y);
      if (d.mode.includes('w')) { next.x = clamp(d.rect.x+dx,0,d.rect.x+d.rect.width-320); next.width = d.rect.width+d.rect.x-next.x; }
      if (d.mode.includes('n')) { next.y = clamp(d.rect.y+dy,0,d.rect.y+d.rect.height-230); next.height = d.rect.height+d.rect.y-next.y; }
    }
    d.current = next;
    if (ref.current) { ref.current.style.left = `${next.x}px`; ref.current.style.top = `${next.y}px`; ref.current.style.width = `${next.width}px`; ref.current.style.height = `${next.height}px`; }
  };
  const end = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    if (snap && drag.current.mode === 'move') kernel.windows.snap(win.id,snap); else kernel.windows.geometry(win.id,drag.current.current);
    drag.current = null; setSnap(null); setInteracting(false);
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };
  const Component = appComponents[win.appId];
  return <>
    {snap && <div className={`snap-preview snap-${snap}`}/>}
    <section ref={ref} role="dialog" aria-label={win.title} aria-hidden={win.minimized} data-window-process={process.id} className={`os-window ${focused ? 'focused' : ''} ${win.maximized ? 'maximized' : ''} ${interacting ? 'interacting' : ''}`} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: win.z, display: win.minimized ? 'none' : undefined, '--window-accent': win.color } as CSSProperties} onPointerDown={() => !focused && kernel.windows.focus(win.id)}>
      <header className="window-titlebar" onDoubleClick={() => kernel.windows.maximize(win.id)} onPointerDown={e => begin(e,'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <AppIcon name={win.icon} color={win.color} size={23}/><span className="window-title">{win.title}</span><span className="window-pid">PID {process.id}</span>
        <div className="window-controls"><button aria-label="Minimize" title="Minimize" onClick={() => kernel.windows.minimize(win.id)}><Minus size={15}/></button><button aria-label={win.maximized ? 'Restore' : 'Maximize'} title={win.maximized ? 'Restore' : 'Maximize'} onClick={() => kernel.windows.maximize(win.id)}>{win.maximized ? <Copy size={12}/> : <Square size={12}/>}</button><button className="window-close" aria-label="Close window" title="Close" onClick={() => kernel.windows.close(win.id)}><X size={16}/></button></div>
      </header>
      <div className="window-content">
        <AppBoundary key={`${win.appId}-${process.id}`} appId={win.appId}><Suspense fallback={<Loading/>}>{Component ? <Component process={process} window={win} filePath={win.filePath}/> : pkg.manifest.type === 'rendygl' ? <WasmView process={process} window={win}/> : <HTML5View process={process} window={win}/>}</Suspense></AppBoundary>
        {process.state === 'suspended' && <div className="suspended-overlay"><Icon name="Clock3" size={30}/><h3>Application paused</h3><p>Resume this process in Task Manager.</p><button className="btn btn-primary" onClick={() => kernel.processes.suspend(process.id)}>Resume</button></div>}
      </div>
      {!win.maximized && ['n','s','e','w','ne','nw','se','sw'].map(direction => <div key={direction} className={`resize-handle resize-${direction}`} onPointerDown={e => begin(e,direction)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>)}
    </section>
  </>;
}
