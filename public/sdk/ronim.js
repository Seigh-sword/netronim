// ronim-js · secure Netronim app API
// The OS injects a permission-gated `window.ronim` bridge into HTML5View apps.
// This module is a thin, typed wrapper you can bundle as assets/ronim.js.
const bridge = () => {
  const api = globalThis.ronim || globalThis.netronim;
  if (!api) throw new Error('ronim-js must run inside a Netronim HTML5View app.');
  return api;
};
export const version = '1.0.0';
export const app = Object.freeze({ ...globalThis.ronim?.app });
export const fs = {
  list: path => bridge().fs.list(path),
  read: path => bridge().fs.read(path),
  write: (path, content) => bridge().fs.write(path, content),
};
export const storage = {
  get: key => bridge().storage.get(key),
  set: (key, value) => bridge().storage.set(key, value),
};
export const clipboard = {
  read: () => bridge().clipboard.read(),
  write: text => bridge().clipboard.write(text),
};
export const notify = (title, message) => bridge().notify(title, message);
export const process = () => bridge().process();
export const desktop = {
  get: () => bridge().desktop.get(),
  set: patch => bridge().desktop.set(patch),
  exportXML: () => bridge().desktop.exportXML(),
  applyXML: xml => bridge().desktop.applyXML(xml),
  pin: (appId, target = 'taskbar') => bridge().desktop.pin(appId, target),
  unpin: (appId, target = 'taskbar') => bridge().desktop.unpin(appId, target),
  addShortcut: (appId, x, y) => bridge().desktop.addShortcut(appId, x, y),
  removeShortcut: appId => bridge().desktop.removeShortcut(appId),
};
export const apps = {
  list: () => bridge().apps.list(),
  launch: appId => bridge().apps.launch(appId),
  uninstall: appId => bridge().apps.uninstall(appId),
};
export default Object.freeze({ version, app, fs, storage, clipboard, notify, process, desktop, apps });
