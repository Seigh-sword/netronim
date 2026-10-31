import { describe, expect, it } from 'vitest';
import { sanitizeDesktopPatch, safeWallpaper, desktopToXML } from './desktop';
import { osStore, DEFAULT_SETTINGS, mergeSettings } from './store';

describe('desktop customization safety', () => {
  it('migrates the old JPEG wallpaper to native NIF', () => {
    expect(mergeSettings({ wallpaper: '/wallpapers/netronim-dusk.jpg' }).wallpaper).toBe('/wallpapers/netronim-dusk.nif');
  });
  it('clamps taskbar controls and ignores privileged settings', () => {
    const patch = sanitizeDesktopPatch({ taskbar: { opacity: 900, blur: -4, iconSize: 3, position: 'top' }, proxyEndpoint: 'https://evil.example', updateEndpoint: 'https://evil.example', username: 'hacked' });
    expect(patch.taskbar?.opacity).toBe(100);
    expect(patch.taskbar?.blur).toBe(0);
    expect(patch.taskbar?.iconSize).toBe(24);
    expect(patch.taskbar?.position).toBe('top');
    expect(patch).not.toHaveProperty('proxyEndpoint');
    expect(patch).not.toHaveProperty('updateEndpoint');
    expect(patch).not.toHaveProperty('username');
  });
  it('only accepts installed app IDs for shortcuts and pins', () => {
    osStore.setState({ packages: [{ manifest: { ...DEFAULT_SETTINGS, id: 'terminal', name: 'Terminal', version: '1.0.0', author: 'Netronim', description: '', icon: 'SquareTerminal', color: '#8ed6b2', type: 'html5view', min_os_version: '1.0.0', permissions: [], category: 'System' }, builtin: true, installedAt: 0 }] as never });
    const patch = sanitizeDesktopPatch({ desktopShortcuts: ['terminal', 'missing-app'], taskbarPinned: ['missing-app'] });
    expect(patch.desktopShortcuts).toEqual(['terminal']);
    expect(patch.taskbarPinned).toEqual([]);
  });
  it('rejects unsafe wallpaper URLs', () => {
    expect(safeWallpaper('javascript:alert(1)', '/wallpapers/netronim-dusk.nif')).toBe('/wallpapers/netronim-dusk.nif');
    expect(safeWallpaper('data:image/webp;base64,AAAA', '/x')).toBe('data:image/webp;base64,AAAA');
  });
  it('exports XML with the current taskbar settings', () => {
    const xml = desktopToXML(mergeSettings({ taskbar: { ...DEFAULT_SETTINGS.taskbar, opacity: 65, align: 'left' } }));
    expect(xml).toContain('<netronim-desktop version="1">');
    expect(xml).toContain('opacity="65"');
    expect(xml).toContain('align="left"');
  });
});
