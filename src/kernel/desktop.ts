import type { Settings, TaskbarSettings } from './types';
import { osStore } from './store';
import { clamp } from './utils';

const BOOL = new Set(['true', '1', 'yes', 'on']);
const isBool = (value: string | null | undefined, fallback: boolean) => value == null ? fallback : BOOL.has(value.toLowerCase());
const num = (value: string | null | undefined, fallback: number, min: number, max: number) => value == null || value === '' ? fallback : clamp(Number(value) || fallback, min, max);
const list = (value: unknown, max = 80): string[] => Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(x)))].slice(0, max) : [];

export function safeWallpaper(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length > 4_000_000) return fallback;
  if (/^data:image\/(webp|png|jpeg|gif|svg\+xml);/i.test(value)) return value;
  try { const url = new URL(value, location.origin); if (url.origin === location.origin && /\.(nif|webp|png|jpe?g|gif|svg)$/i.test(url.pathname)) return url.pathname + url.search; } catch { /* ignore */ }
  return fallback;
}

/** Only appearance/layout fields may be changed by desktop XML or ronim-js. */
export function sanitizeDesktopPatch(input: unknown): Partial<Settings> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const current = osStore.getState().settings;
  const installed = new Set(osStore.getState().packages.map(p => p.manifest.id));
  const patch: Partial<Settings> = {};
  if ('wallpaper' in raw) patch.wallpaper = safeWallpaper(raw.wallpaper, current.wallpaper);
  if (raw.theme === 'dark' || raw.theme === 'light') patch.theme = raw.theme;
  if (typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent)) patch.accent = raw.accent;
  if ('uiScale' in raw) patch.uiScale = clamp(Number(raw.uiScale) || 100, 70, 150);
  if ('brightness' in raw) patch.brightness = clamp(Number(raw.brightness) || 100, 35, 100);
  if ('reduceMotion' in raw) patch.reduceMotion = !!raw.reduceMotion;
  if ('showDesktopIcons' in raw) patch.showDesktopIcons = !!raw.showDesktopIcons;
  if ('desktopShowLabels' in raw) patch.desktopShowLabels = !!raw.desktopShowLabels;
  if ('desktopIconSize' in raw) patch.desktopIconSize = clamp(Number(raw.desktopIconSize) || 49, 28, 84);
  if ('desktopGrid' in raw) patch.desktopGrid = clamp(Number(raw.desktopGrid) || 94, 64, 160);
  if ('clock24' in raw) patch.clock24 = !!raw.clock24;
  if (Array.isArray(raw.taskbarPinned)) patch.taskbarPinned = list(raw.taskbarPinned).filter(id => installed.has(id));
  if (Array.isArray(raw.desktopShortcuts)) patch.desktopShortcuts = list(raw.desktopShortcuts).filter(id => installed.has(id));
  if (raw.iconPositions && typeof raw.iconPositions === 'object') {
    const positions: Settings['iconPositions'] = {};
    for (const [id, value] of Object.entries(raw.iconPositions as Record<string, unknown>).slice(0, 200)) {
      if (!value || typeof value !== 'object') continue;
      const p = value as Record<string, unknown>;
      positions[id.slice(0, 240)] = { x: clamp(Number(p.x) || 0, 0, 8000), y: clamp(Number(p.y) || 0, 0, 8000) };
    }
    patch.iconPositions = positions;
  }
  if (raw.taskbar && typeof raw.taskbar === 'object') {
    const t = raw.taskbar as Record<string, unknown>; const base = current.taskbar;
    const taskbar: TaskbarSettings = {
      position: t.position === 'top' ? 'top' : 'bottom',
      glass: 'glass' in t ? !!t.glass : base.glass,
      opacity: 'opacity' in t ? clamp(Number(t.opacity) || 0, 15, 100) : base.opacity,
      blur: 'blur' in t ? clamp(Number(t.blur) || 0, 0, 48) : base.blur,
      iconSize: 'iconSize' in t ? clamp(Number(t.iconSize) || 35, 24, 52) : base.iconSize,
      align: t.align === 'left' ? 'left' : 'center',
      autoHide: 'autoHide' in t ? !!t.autoHide : base.autoHide,
      showSearch: 'showSearch' in t ? !!t.showSearch : base.showSearch,
      showWorkspaces: 'showWorkspaces' in t ? !!t.showWorkspaces : base.showWorkspaces,
      showTray: 'showTray' in t ? !!t.showTray : base.showTray,
    };
    patch.taskbar = taskbar;
  }
  return patch;
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function desktopToXML(settings: Settings): string {
  const t = settings.taskbar;
  const shortcuts = settings.desktopShortcuts.map(id => { const p = settings.iconPositions[id]; return `    <app id="${esc(id)}"${p ? ` x="${Math.round(p.x)}" y="${Math.round(p.y)}"` : ''} />`; }).join('\n');
  const pinned = settings.taskbarPinned.map(id => `    <app id="${esc(id)}" />`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<netronim-desktop version="1">\n  <appearance wallpaper="${esc(settings.wallpaper)}" theme="${settings.theme}" accent="${esc(settings.accent)}" uiScale="${settings.uiScale}" brightness="${settings.brightness}" reduceMotion="${settings.reduceMotion}" />\n  <taskbar position="${t.position}" glass="${t.glass}" opacity="${t.opacity}" blur="${t.blur}" iconSize="${t.iconSize}" align="${t.align}" autoHide="${t.autoHide}" showSearch="${t.showSearch}" showWorkspaces="${t.showWorkspaces}" showTray="${t.showTray}" />\n  <desktop icons="${settings.showDesktopIcons}" labels="${settings.desktopShowLabels}" iconSize="${settings.desktopIconSize}" grid="${settings.desktopGrid}" />\n  <shortcuts>\n${shortcuts}\n  </shortcuts>\n  <pinned>\n${pinned}\n  </pinned>\n</netronim-desktop>\n`;
}

export function parseDesktopXML(xml: string): Partial<Settings> {
  if (xml.length > 256_000) throw new Error('Desktop XML is limited to 256 KB.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Desktop XML is not well-formed.');
  const root = doc.documentElement;
  if (root.nodeName !== 'netronim-desktop') throw new Error('Expected a <netronim-desktop> root element.');
  if (root.getAttribute('version') !== '1') throw new Error('Unsupported desktop XML version.');
  const appearance = root.querySelector('appearance'); const taskbar = root.querySelector('taskbar'); const desktop = root.querySelector('desktop');
  const patch: Record<string, unknown> = {};
  if (appearance) {
    patch.wallpaper = appearance.getAttribute('wallpaper') ?? undefined;
    patch.theme = appearance.getAttribute('theme') ?? undefined;
    patch.accent = appearance.getAttribute('accent') ?? undefined;
    patch.uiScale = appearance.getAttribute('uiScale') ?? undefined;
    patch.brightness = appearance.getAttribute('brightness') ?? undefined;
    patch.reduceMotion = isBool(appearance.getAttribute('reduceMotion'), false);
  }
  if (taskbar) patch.taskbar = {
    position: taskbar.getAttribute('position') || 'bottom', glass: isBool(taskbar.getAttribute('glass'), true),
    opacity: num(taskbar.getAttribute('opacity'), 78, 15, 100), blur: num(taskbar.getAttribute('blur'), 26, 0, 48),
    iconSize: num(taskbar.getAttribute('iconSize'), 35, 24, 52), align: taskbar.getAttribute('align') || 'center',
    autoHide: isBool(taskbar.getAttribute('autoHide'), false), showSearch: isBool(taskbar.getAttribute('showSearch'), true),
    showWorkspaces: isBool(taskbar.getAttribute('showWorkspaces'), true), showTray: isBool(taskbar.getAttribute('showTray'), true),
  };
  if (desktop) { patch.showDesktopIcons = isBool(desktop.getAttribute('icons'), true); patch.desktopShowLabels = isBool(desktop.getAttribute('labels'), true); patch.desktopIconSize = num(desktop.getAttribute('iconSize'), 49, 28, 84); patch.desktopGrid = num(desktop.getAttribute('grid'), 94, 64, 160); }
  const shortcuts = [...root.querySelectorAll('shortcuts > app')].map(el => el.getAttribute('id')).filter(Boolean);
  if (shortcuts.length) patch.desktopShortcuts = shortcuts;
  const pinned = [...root.querySelectorAll('pinned > app')].map(el => el.getAttribute('id')).filter(Boolean);
  if (pinned.length) patch.taskbarPinned = pinned;
  const positions: Settings['iconPositions'] = {};
  for (const el of root.querySelectorAll('shortcuts > app')) { const id = el.getAttribute('id'); if (id && (el.hasAttribute('x') || el.hasAttribute('y'))) positions[id] = { x: num(el.getAttribute('x'), 24, 0, 8000), y: num(el.getAttribute('y'), 76, 0, 8000) }; }
  if (Object.keys(positions).length) patch.iconPositions = positions;
  return sanitizeDesktopPatch(patch);
}
