export type Permission = 'fs:read' | 'fs:write' | 'network' | 'clipboard' | 'notifications' | 'camera' | 'microphone' | 'processes' | 'desktop:read' | 'desktop:write' | 'apps:launch' | 'apps:manage';
export interface TaskbarSettings { position: 'bottom' | 'top'; glass: boolean; opacity: number; blur: number; iconSize: number; align: 'left' | 'center'; autoHide: boolean; showSearch: boolean; showWorkspaces: boolean; showTray: boolean }
export interface DesktopState { wallpaper: string; theme: 'dark' | 'light'; accent: string; uiScale: number; brightness: number; taskbar: TaskbarSettings; taskbarPinned: string[]; desktopShortcuts: string[]; iconPositions: Record<string, { x: number; y: number }>; desktopIconSize: number; desktopGrid: number; desktopShowLabels: boolean }
export interface AppInfo { id: string; name: string; version: string; type: 'html5view' | 'rendygl'; builtin: boolean; permissions: Permission[] }
export const version: string;
export const app: { id: string; name: string; permissions: Permission[] };
export const fs: { list(path?: string): Promise<unknown[]>; read(path: string): Promise<{ mime: string; text?: string; base64?: string }>; write(path: string, content: string): Promise<unknown> };
export const storage: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<boolean> };
export const clipboard: { read(): Promise<string>; write(text: string): Promise<boolean> };
export function notify(title: string, message: string): Promise<boolean>;
export function process(): Promise<{ id: number; appId: string }>;
export const desktop: { get(): Promise<DesktopState>; set(patch: Partial<DesktopState>): Promise<boolean>; exportXML(): Promise<string>; applyXML(xml: string): Promise<boolean>; pin(appId: string, target?: 'taskbar' | 'desktop'): Promise<boolean>; unpin(appId: string, target?: 'taskbar' | 'desktop'): Promise<boolean>; addShortcut(appId: string, x?: number, y?: number): Promise<boolean>; removeShortcut(appId: string): Promise<boolean> };
export const apps: { list(): Promise<AppInfo[]>; launch(appId: string): Promise<boolean>; uninstall(appId: string): Promise<boolean> };
declare const ronim: { version: typeof version; app: typeof app; fs: typeof fs; storage: typeof storage; clipboard: typeof clipboard; notify: typeof notify; process: typeof process; desktop: typeof desktop; apps: typeof apps };
export default ronim;
