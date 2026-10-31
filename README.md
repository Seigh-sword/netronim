# Netronim OS

A browser-resident desktop environment built with React, TypeScript, Vite, WebAssembly, IndexedDB, and Cloudflare Pages Functions. It is a real workspace — windows, files, apps, packages, media, a terminal, and settings persist across reloads — while staying honest about the boundaries of a web page.

> Netronim is not a host operating system. It cannot replace your kernel, access arbitrary host files, manage Wi-Fi, or give JavaScript host-level process isolation. It is a persistent, modular desktop that runs inside the browser sandbox.

## Quick start

```bash
npm ci
npm run dev          # Vite + local development API middleware
```

Open the printed URL, choose a local username, and sign in. The first boot opens Welcome.

```bash
npm test             # Vitest unit tests
npm run typecheck    # App + Cloudflare Functions
npm run build        # WASM binaries, typecheck, production bundle
npm run preview      # Static preview of dist/ (no Pages Functions)
npm run dev:cloudflare  # Build, then serve dist/ with Wrangler Pages dev
npm run deploy       # Build and deploy to Cloudflare Pages project "netronim"
```

Node 22+ is recommended. The production build writes `dist/`; generated WASM binaries are committed under `public/wasm/` and rebuilt from `wasm/*.wat` by `scripts/build-wasm.mjs`.

## What is inside

### Kernel and desktop

- **Boot/login/onboarding** with real initialization stages: filesystem, processes, display, windows, event bus, packages, updates.
- **Persistent filesystem** in IndexedDB: directories, text/binary files, copy/move/rename, Trash, permissions, protected system paths, import/export, full `.nbk` backup/restore.
- **Process manager** with launch, focus, cooperative suspend/resume, kill, resource estimates, and a configurable process limit.
- **Window manager / CSS compositor**: drag, resize, minimize, maximize/restore, edge snap, tiling, focus/z-order, session restore, two workspaces, UI scaling.
- **Event bus, package manager, update manager, media pipeline, RendyGL graphics abstraction**.
- **Desktop shell**: wallpaper, draggable icons, context menus, taskbar, Start menu/search, tray clock, volume, brightness, battery (when the browser exposes it), notifications, update indicator.
- **Settings**: display/theme/accent/scaling, sound, network/proxy, app install/remove/export, user/backup, storage, updates.

### 29 built-in apps

System Files, Settings, Terminal, NetBrowse, Task Manager, Update Manager, Notebook, Sketchbook, ronimCanvas, Calculator, Calendar, Clock, Txt Edit, Photo Viewer, Video Player, Music Player, Voice Recorder, Camera, Weather, System Monitor, About Netronim, Welcome, Clipboard Manager, System Logs, Archive Studio, Hex Editor, Prism Flow, Pixel Pulse, Contacts.

### Dual app rendering

- **HTML5View** runs installed HTML apps in an opaque-origin sandboxed iframe with a CSP and a token/source-checked, permission-gated OS bridge (`fs`, app-scoped `storage`, `clipboard`, `notify`, `process`). Local HTML apps are unprivileged by default; URL wrappers request only `network`.
- **RendyGL** is a small WebGPU → WebGL abstraction for buffers, shaders, textures, NIF images, and frame scheduling. Prism Flow uses WASM particle physics; Pixel Pulse and generic NPK WASM apps use a worker framebuffer ABI.
- Generic WASM NPK apps export `memory` and `render(time, pointerX, pointerY) -> pointer` for a 256×160 RGBA framebuffer, with optional `init(width, height)`. They run in a Worker with no WASI imports and are terminated on close.

### NPK packages

`Archive Studio` can inspect, create, install, export, and remove packages. Terminal supports `install`, `uninstall`, `apps`, and `open`.

NPK1 layout:

```text
_META/manifest.json
_META/changelog.json
_HEADERS/api.xml
_HEADERS/associations.json
_HEADERS/ipc.xml
index.html | app.wasm
assets/...
```

The container has a 32-byte header, DEFLATE-compressed entries, a JSON directory, CRC32 integrity checks, and SHA-256 export digests. Extraction is bounded (entry count, path traversal, expanded size, archive size). Manifests declare permissions and OS compatibility; downgrades and built-in replacement are guarded.

### Media

Import converts when the browser supports the codec:

- images → `.nif` (WebP, quality ≈ 0.8)
- video → `.vid` (WebM via MediaRecorder)
- audio → `.aud` (WebM audio via MediaRecorder)
- other files are stored as text/binary; unsupported codecs stay original

Originals can optionally be kept. Files can be exported/downloaded. Camera saves NIF photos; Voice Recorder saves local audio; players use native browser playback. Import is capped at 256 MB per file and can be cancelled.

### Terminal

A first-class browser shell with persisted history, environment, aliases, and working directory. It supports pipes, `&&`/`||`, `>`/`>>`, quoting, globbing, tab completion, reverse search, and Ctrl+C interruption. Command groups include:

- files: `ls cd pwd mkdir touch rm trash cp mv cat head tail wc find tree du df chmod`
- text: `echo grep sort uniq`
- system: `ps top kill suspend resume sysinfo neofetch uname uptime date whoami env set`
- packages/updates: `apps install uninstall open update reboot shutdown`
- media/web: `import export format curl wget ping clipboard notify`
- desktop: `theme wallpaper workspace tile backup history alias unalias help man version exit`

`ping` is an HTTPS probe through the proxy, not ICMP. Files live in IndexedDB, not on the host machine.

### NetBrowse and Weather

NetBrowse is a tabbed reader browser with history, bookmarks, downloads, and a server-side proxy (`functions/api/proxy.ts`). It rewrites public HTML/CSS, disables remote scripts, blocks local/internal/metadata addresses, limits redirects/time/body size, and can download files into System Files. It is **not** a full remote browser: complex web apps, sign-in, DRM, and sites that block proxying may fail.

Weather uses Cloudflare-cached Open-Meteo endpoints, with a direct browser fallback for static deployments. Geolocation is optional and permission-gated.

### Updates

`public/release.json` and `/api/updates` expose a signed-by-hash release manifest. The client validates semver, SHA-256, and same-origin package URLs, stages installs, shows changelog/tray notifications, and can reboot into the updated shell. The bundled release is `1.0.0` with no pending packages.

## Cloudflare deployment

The repo includes:

- `wrangler.jsonc` — Pages output directory and proxy variables
- `functions/api/proxy.ts`, `weather.ts`, `updates.ts` — Pages Functions
- `public/_headers`, `public/_redirects`, `public/sw.js` — caching, SPA fallback, offline app shell
- `.github/workflows/ci.yml` — test + build
- `.github/workflows/deploy.yml` — deploy on `main` or manual dispatch

### Direct deploy

```bash
npx wrangler login
npm run deploy
```

### GitHub Actions deploy

Add repository secrets:

- `CLOUDFLARE_API_TOKEN` — token with Cloudflare Pages edit permission
- `CLOUDFLARE_ACCOUNT_ID`

Push to `main` or run **Deploy to Cloudflare Pages** manually.

### Proxy configuration

`wrangler.jsonc` sets `PROXY_ENABLED=true`. For untrusted/public deployments, strongly consider a hard allowlist:

```jsonc
"vars": {
  "PROXY_ENABLED": "true",
  "PROXY_ALLOWED_HOSTS": "example.com,docs.example.com"
}
```

For local Wrangler development, copy `.dev.vars.example` to `.dev.vars`.

## Offline and persistence

A production service worker precaches the app shell, hashed chunks, wallpapers, and WASM after the first visit (`scripts/build-sw.mjs` injects the build manifest). User data is **not** stored in the service worker cache; it lives in IndexedDB. Browser storage can still be cleared or evicted, so use **Settings → Users & backup → Export backup** regularly. “Request persistent storage” asks the browser not to evict the site automatically, but it is not a guarantee.

## Security boundaries and honest limits

- HTML5View apps are sandboxed and permission-checked, but the OS process manager is cooperative, not host-level isolation.
- WASM framebuffers run in a Worker; no WASI, host imports, or arbitrary syscalls are provided.
- The proxy validates public IPs with DoH before fetching, but a DNS-rebinding window and regex-based HTML sanitization remain. Use `PROXY_ALLOWED_HOSTS`, rate limiting, and a hardened proxy for hostile multi-user deployments.
- The proxy caps bodies at 5 MB, redirects at 4, and timeouts at ~12 s. It is a reader aid, not a general-purpose anonymizing proxy.
- Camera/microphone/geolocation require browser permission and secure context. Battery/clipboard/fullscreen support depends on the browser.
- NetBrowse cannot bypass a site’s anti-embedding or security policies. URL-installed web apps may be blocked by the remote site.
- Update manifests are integrity-checked, not a substitute for a signed supply chain. Serve them only from a trusted origin.

## Project layout

```text
src/kernel/       store, db, fs, processes, windows, bus, display, npk,
                  packages, media, updates, rendygl, kernel orchestration
src/components/   Desktop, Taskbar, WindowFrame, BootLogin, DialogHost,
                  HTML5View, WasmView, shared UI
src/apps/         29 app modules, manifests, registry, terminal parser,
                  calculator parser, app styles
functions/api/    Cloudflare Pages Functions (proxy, weather, updates)
scripts/          WASM build, service-worker manifest, Vite development API
wasm/             WAT sources for bundled WASM apps
public/           wallpapers, manifest, release.json, WASM, SW, Pages files
```

## Verification

Current checks:

```bash
npm test          # 52 unit tests: NPK, filesystem, proxy IP policy,
                  # calculator parser, terminal parser
npm run typecheck
npm run build
```

Browser smoke tests have launched all 29 apps, exercised calculator/terminal/persistence, window drag/resize/snap/workspaces/UI scaling, Start search, NPK build/install/uninstall, HTML5 bridge storage and permission denial, media import/export, WASM controls, ronimCanvas pen/SVG export, and empty Photo Viewer. A production preview was also reloaded fully offline and launched a lazy-loaded app from the service-worker cache. Weather/proxy outbound access depends on the deployment environment.
