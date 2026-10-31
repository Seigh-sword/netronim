import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { OSState, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  username: 'Explorer', wallpaper: '/wallpapers/netronim-dusk.nif', theme: 'dark', accent: '#b7a3f7',
  volume: 65, brightness: 100, uiScale: 100, reduceMotion: false, clock24: false,
  skipLogin: false, keepOriginals: false, autoConvert: true, processLimit: 40,
  updateEndpoint: '/api/updates', updateChannel: 'stable', proxyEndpoint: '/api/proxy',
  iconPositions: {}, onboardingComplete: false, showDesktopIcons: true,
  taskbar: { position: 'bottom', glass: true, opacity: 78, blur: 26, iconSize: 35, align: 'center', autoHide: false, showSearch: true, showWorkspaces: true, showTray: true },
  taskbarPinned: ['files','browser','terminal','notebook','canvas'],
  desktopShortcuts: ['files','browser','terminal','notebook','sketchbook','canvas','settings'],
  desktopIconSize: 49, desktopGrid: 94, desktopShowLabels: true,
};
export function mergeSettings(saved?: Partial<Settings> | null): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...saved, taskbar: { ...DEFAULT_SETTINGS.taskbar, ...saved?.taskbar } };
  // Migrate the shipped wallpaper from JPEG to the native NIF/WebP asset.
  if (merged.wallpaper === '/wallpapers/netronim-dusk.jpg') merged.wallpaper = DEFAULT_SETTINGS.wallpaper;
  if (!Array.isArray(merged.taskbarPinned)) merged.taskbarPinned = DEFAULT_SETTINGS.taskbarPinned;
  if (!Array.isArray(merged.desktopShortcuts)) merged.desktopShortcuts = DEFAULT_SETTINGS.desktopShortcuts;
  if (!merged.iconPositions || typeof merged.iconPositions !== 'object') merged.iconPositions = {};
  return merged;
}
export const osStore = createStore<OSState>(() => ({
  phase: 'boot', bootLines: [], bootProgress: 0, error: '', settings: DEFAULT_SETTINGS,
  files: [], processes: [], windows: [], workspace: 0, focusedWindow: null,
  packages: [], logs: [], notifications: [], clipboard: [], fileClipboard: null,
  dialog: null, update: null, updateProgress: 0, importProgress: null,
  metrics: { fps: 60, heap: 0, storage: 0, time: Date.now() },
}));
export const useOS = () => useStore(osStore);
