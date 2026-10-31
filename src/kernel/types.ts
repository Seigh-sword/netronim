import type { ComponentType } from 'react';

export const OS_VERSION = '1.0.0';
export const KERNEL_VERSION = '1.0.0';
export const RENDY_VERSION = '0.9.0';
export type FileKind = 'directory' | 'text' | 'image' | 'video' | 'audio';
export interface VNode {
  path: string; name: string; parent: string; type: 'file' | 'directory';
  kind: FileKind; size: number; mime: string; created: number; modified: number;
  mode: number; owner: string;
}
export interface FileRecord extends VNode { data?: Blob }
export type Permission = 'fs:read' | 'fs:write' | 'network' | 'clipboard' | 'notifications' | 'camera' | 'microphone' | 'processes' | 'desktop:read' | 'desktop:write' | 'apps:launch' | 'apps:manage';
export const PERMISSIONS: Permission[] = ['fs:read','fs:write','network','clipboard','notifications','camera','microphone','processes','desktop:read','desktop:write','apps:launch','apps:manage'];
export interface AppManifest {
  id: string; name: string; version: string; author: string; description: string;
  icon: string; color: string; type: 'rendygl' | 'html5view';
  min_os_version: string; permissions: Permission[];
  category: 'System' | 'Productivity' | 'Media' | 'Utilities' | 'Games';
  entry?: string; associations?: string[];
}
export interface InstalledPackage {
  manifest: AppManifest; builtin: boolean; installedAt: number;
  files?: Record<string, Uint8Array>;
  headers?: { api: string; associations: string; ipc: string };
  changelog?: { version: string; date: string; notes: string[] }[];
}
export interface AppProps { process: ProcessInfo; window: OSWindow; filePath?: string }
export interface AppDefinition { manifest: AppManifest; component: ComponentType<AppProps> }
export interface ProcessInfo {
  id: number; appId: string; name: string; startedAt: number; state: 'running' | 'suspended';
  memory: number; cpu: number; workspace: number;
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface OSWindow extends Rect {
  id: number; processId: number; appId: string; title: string; icon: string; color: string;
  minimized: boolean; maximized: boolean; z: number; workspace: number;
  filePath?: string; restore?: Rect;
}
export interface TaskbarSettings {
  position: 'bottom' | 'top'; glass: boolean; opacity: number; blur: number;
  iconSize: number; align: 'left' | 'center'; autoHide: boolean;
  showSearch: boolean; showWorkspaces: boolean; showTray: boolean;
}
export interface Settings {
  username: string; wallpaper: string; theme: 'dark' | 'light'; accent: string;
  volume: number; brightness: number; uiScale: number; reduceMotion: boolean;
  clock24: boolean; skipLogin: boolean; keepOriginals: boolean; autoConvert: boolean;
  processLimit: number; updateEndpoint: string; updateChannel: 'stable' | 'preview';
  proxyEndpoint: string; iconPositions: Record<string, { x: number; y: number }>;
  onboardingComplete: boolean; showDesktopIcons: boolean;
  taskbar: TaskbarSettings; taskbarPinned: string[]; desktopShortcuts: string[];
  desktopIconSize: number; desktopGrid: number; desktopShowLabels: boolean;
}
export interface LogEntry { id: number; time: number; level: 'info' | 'warn' | 'error'; source: string; message: string }
export interface Notification { id: string; title: string; message: string; time: number; appId?: string; read: boolean }
export interface UpdateInfo { version: string; channel: string; date: string; notes: string[]; packages?: { url: string; sha256: string }[]; shellReload?: boolean }
export interface DialogRequest { title: string; message?: string; label?: string; value?: string; placeholder?: string; confirmLabel?: string; danger?: boolean; input: boolean; resolve: (value: string | null) => void }
export interface OSState {
  phase: 'boot' | 'login' | 'desktop' | 'off' | 'updating' | 'error'; bootLines: string[]; bootProgress: number; error: string;
  settings: Settings; files: VNode[]; processes: ProcessInfo[]; windows: OSWindow[];
  workspace: number; focusedWindow: number | null; packages: InstalledPackage[];
  logs: LogEntry[]; notifications: Notification[]; clipboard: string[];
  fileClipboard: { paths: string[]; cut: boolean } | null;
  dialog: DialogRequest | null; update: UpdateInfo | null; updateProgress: number;
  importProgress: { name: string; progress: number } | null;
  metrics: { fps: number; heap: number; storage: number; time: number };
}
