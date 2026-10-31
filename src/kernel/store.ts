import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { OSState, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  username: 'Explorer', wallpaper: '/wallpapers/netronim-dusk.jpg', theme: 'dark', accent: '#b7a3f7',
  volume: 65, brightness: 100, uiScale: 100, reduceMotion: false, clock24: false,
  skipLogin: false, keepOriginals: false, autoConvert: true, processLimit: 40,
  updateEndpoint: '/api/updates', updateChannel: 'stable', proxyEndpoint: '/api/proxy',
  iconPositions: {}, onboardingComplete: false, showDesktopIcons: true,
};
export const osStore = createStore<OSState>(() => ({
  phase: 'boot', bootLines: [], bootProgress: 0, error: '', settings: DEFAULT_SETTINGS,
  files: [], processes: [], windows: [], workspace: 0, focusedWindow: null,
  packages: [], logs: [], notifications: [], clipboard: [], fileClipboard: null,
  dialog: null, update: null, updateProgress: 0, importProgress: null,
  metrics: { fps: 60, heap: 0, storage: 0, time: Date.now() },
}));
export const useOS = () => useStore(osStore);
