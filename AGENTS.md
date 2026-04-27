# Repository Guidelines

## Build & Verify

- `npm install --package-lock=false --legacy-peer-deps` — lockfile is intentionally disabled (`.npmrc`: `package-lock=false`); `--legacy-peer-deps` is needed due to older dependency tree.
- `npm run prepare` — compiles `src/` → `dist/` via `tsc`. Run this before testing changes.
- `npm run eslint` — lints tracked `.ts`/`.tsx` files. Must pass before submitting.
- No automated test suite. After changes, smoke-test manually against at least one backend URL.

## Architecture

Single-file app: `src/index.ts` (~414 lines). Do not split unless the file grows significantly.

The proxy serves assets from a Steam `package.nw` zip and rewrites three critical files at runtime:
- `index.html` — injects auth/localStorage shim, strips third-party trackers
- `config.js` — generates `API_URL`, `HISTORY_URL`, `WEBSOCKET_URL`, `PREFIX` config
- `build.min.js` — patches `options={}` objects with `protocol/host/port/official`, rewrites hardcoded HTTP URLs to use `options.protocol`, replaces CDN origin with local proxy path

The `build.min.js` patching depends on fragile string matching (`/\boptions=\{/g` scan + brace counting). Changes here must be tested against the real client bundle.

URL routing uses the form `/(<backend_url>)/<path>` parsed by `extract()`. The trailing slash is required in browser URLs. When `--backend` is set, the wrapped prefix is omitted.

## Style

- Tabs, single quotes, semicolons. `const` by default.
- `--kebab-case` for new CLI flags, but preserve existing `--underscore` flags like `--internal_backend` and `--public_hostname`.
- Comments only for non-obvious Screeps compatibility hacks or protocol quirks.

## Gotchas

- `dist/` is the published npm binary target (`"bin": "dist/index.js"`). Never edit it by hand.
- JSZip's `nodeStream()` has a broken implementation that causes EPIPE crashes; the code passes it through a no-op `Transform` stream as a workaround. Don't remove that.
- Auth endpoints (`/api/auth/*`) get a `returnUrl` query parameter injected — this is needed for Steam OpenID redirect flow on private servers.
- The `official` flag in `build.min.js` patching is determined by hostname check (`screeps.com`) or server feature flag (`official-like`). It controls client UI behavior.
- `npm run eslint` uses `git ls-files` to find targets, so only tracked files are linted.
