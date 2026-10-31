import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { AppProps } from '../kernel/types';
export const appComponents: Record<string, LazyExoticComponent<ComponentType<AppProps>>> = {
  files: lazy(() => import('./Files')), settings: lazy(() => import('./Settings')), terminal: lazy(() => import('./Terminal')),
  browser: lazy(() => import('./NetBrowse')), tasks: lazy(() => import('./TaskManager')), updates: lazy(() => import('./UpdateManager')),
  notebook: lazy(() => import('./Notebook')), sketchbook: lazy(() => import('./Sketchbook')), canvas: lazy(() => import('./RonimCanvas')),
  calculator: lazy(() => import('./Calculator')), calendar: lazy(() => import('./Calendar')), clock: lazy(() => import('./Clock')),
  textedit: lazy(() => import('./TxtEdit')), photos: lazy(() => import('./PhotoViewer')), video: lazy(() => import('./VideoPlayer')),
  music: lazy(() => import('./MusicPlayer')), recorder: lazy(() => import('./VoiceRecorder')), camera: lazy(() => import('./Camera')),
  weather: lazy(() => import('./Weather')), monitor: lazy(() => import('./SystemMonitor')), about: lazy(() => import('./About')),
  welcome: lazy(() => import('./Welcome')), clipboard: lazy(() => import('./Clipboard')), logs: lazy(() => import('./SystemLogs')),
  archives: lazy(() => import('./ArchiveStudio')), hex: lazy(() => import('./HexEditor')), prism: lazy(() => import('./PrismFlow')),
  pulse: lazy(() => import('./PixelPulse')), contacts: lazy(() => import('./Contacts')),
};
