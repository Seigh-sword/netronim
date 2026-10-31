import { osStore } from './store';
import { compareVersions } from './utils';
import { OS_VERSION } from './types';
import { sha256 } from './npk';
import type { UpdateInfo } from './types';
import type { PackageManager } from './packages';
export class UpdateManager {
  constructor(private packages: PackageManager) {}
  async init() { if (!navigator.onLine) return; setTimeout(() => void this.check(false).catch(() => {}), 3500); }
  async check(notify = true): Promise<UpdateInfo> {
    const { updateEndpoint, updateChannel } = osStore.getState().settings;
    const endpoint = new URL(updateEndpoint, location.href);
    if (!['http:','https:'].includes(endpoint.protocol)) throw new Error('Updates require HTTP or HTTPS.');
    endpoint.searchParams.set('channel', updateChannel); endpoint.searchParams.set('current', OS_VERSION);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
    const data = await response.json() as UpdateInfo;
    if (!data || !/^\d+\.\d+\.\d+$/.test(data.version) || !Array.isArray(data.notes) || data.notes.some(n => typeof n !== 'string')) throw new Error('The update endpoint returned an invalid manifest.');
    if (data.packages && (!Array.isArray(data.packages) || data.packages.length > 100 || data.packages.some(p => typeof p.url !== 'string' || !/^[a-f0-9]{64}$/i.test(p.sha256)))) throw new Error('Invalid package update manifest.');
    osStore.setState({ update: data });
    if (compareVersions(data.version, OS_VERSION) > 0 && notify) osStore.getState() && window.dispatchEvent(new CustomEvent('netronim:notify', { detail: { title: `Netronim ${data.version} is ready`, message: 'A new system update is available. Open Update Manager to review it.', appId: 'updates' } }));
    return data;
  }
  async install(reboot: () => Promise<void>) {
    const update = osStore.getState().update;
    if (!update || compareVersions(update.version, OS_VERSION) <= 0) throw new Error('You are already running the latest available version.');
    osStore.setState({ phase: 'updating', updateProgress: 5 });
    try {
      const packages = update.packages || [];
      for (let i = 0; i < packages.length; i++) {
        const item = packages[i]; const url = new URL(item.url, osStore.getState().settings.updateEndpoint.startsWith('/') ? location.href : osStore.getState().settings.updateEndpoint);
        const configured = new URL(osStore.getState().settings.updateEndpoint, location.href);
        if (url.origin !== configured.origin) throw new Error('Update packages must come from the configured update origin.');
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) }); if (!response.ok) throw new Error(`Package download failed: ${response.status}`);
        const declared = Number(response.headers.get('Content-Length') || 0); if (declared > 64 * 1024 * 1024) throw new Error('Update package is too large.');
        const bytes = new Uint8Array(await response.arrayBuffer()); if (await sha256(bytes) !== item.sha256.toLowerCase()) throw new Error('Update checksum verification failed. Nothing was installed.');
        await this.packages.installBytes(bytes); osStore.setState({ updateProgress: 10 + Math.round((i + 1) / packages.length * 75) });
      }
      const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update();
      osStore.setState({ updateProgress: 100 }); await reboot();
    } catch (e) { osStore.setState({ phase: 'desktop' }); throw e; }
  }
}
