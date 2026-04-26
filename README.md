# Screeps Steamless Client

A local web proxy for the Steam version of [Screeps World](https://store.steampowered.com/app/464350/Screeps/).
It serves the official client files from your local `package.nw` and lets you open Screeps in a normal browser.

The proxy can connect to the official MMO server, PTR, seasonal worlds, community/private servers, and local
development servers.

## Requirements

- Node.js and npm
- A legally purchased Steam copy of Screeps World
- Screeps installed through Steam, or a copied `package.nw` from an installed copy

The client files come from Steam. Keep Screeps updated there so this proxy serves the current client.

## Quick Start

Install and run globally:

```sh
npm install -g screeps-steamless-client
screeps-steamless-client
```

Or run from this repository:

```sh
npm install --package-lock=false --legacy-peer-deps
npm run prepare
npx screeps-steamless-client
```

Open the official MMO server:

```text
http://localhost:8080/(https://screeps.com)/
```

The trailing slash is required.

## Locating `package.nw`

The proxy checks common Steam locations on macOS, Windows, Linux, WSL, Flatpak, and Snap installs. If automatic
detection fails, pass the file explicitly:

```sh
npx screeps-steamless-client --package /path/to/Screeps/package.nw
```

On Steam, you can find it from Screeps World -> Manage -> Browse local files.

## Server URLs

Use the wrapped URL form to choose a backend:

```text
http://localhost:8080/(BACKEND_URL)/
```

Examples:

```text
http://localhost:8080/(https://screeps.com)/
http://localhost:8080/(https://screeps.com/ptr)/
http://localhost:8080/(https://screeps.com/season)/
http://localhost:8080/(http://localhost:21025)/
```

For one fixed backend, use `--backend` and open `/` directly:

```sh
npx screeps-steamless-client --backend http://localhost:21025
```

```text
http://localhost:8080/
```

Private servers need Steam OpenID support for normal login. Use `screepsmod-auth` on classic private servers;
xxscreeps usually provides this by default.

## Reverse Proxy / Caddy

Caddy can proxy this service normally, including WebSocket traffic:

```caddyfile
screeps-client.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Run the client with the public browser-facing URL so rewritten history URLs are correct:

```sh
npx screeps-steamless-client \
  --host 127.0.0.1 \
  --port 8080 \
  --public_hostname screeps-client.example.com \
  --public_port 443 \
  --public_tls
```

Do not strip path prefixes in Caddy; the proxy depends on `/(BACKEND_URL)/...` paths.

## Docker / Split Backend URLs

Use `--internal_backend` when the backend URL visible to this process differs from the URL visible to the browser,
for example when the Screeps server is another container:

```sh
npx screeps-steamless-client \
  --backend http://localhost:21025 \
  --internal_backend http://screeps:21025
```

## Options

- `--package <path>`: path to `package.nw`.
- `--host <host>`: bind interface. Default: `localhost`.
- `--port <port>`: bind port. Default: `8080`.
- `--backend <url>`: use one backend directly instead of the wrapped URL form.
- `--internal_backend <url>`: backend URL used by the proxy process.
- `--public_hostname <host>`: hostname browsers use to reach this proxy.
- `--public_port <port>`: public browser-facing port.
- `--public_tls`: mark the public URL as HTTPS.
- `--guest`: enable xxscreeps guest mode.
- `--beautify`: format served JavaScript for debugging.

## Development

```sh
npm install --package-lock=false --legacy-peer-deps
npm run prepare
npm run eslint
npm run watch
```

This repository currently has no automated test suite. For behavior changes, run `npm run prepare`, `npm run eslint`,
and manually smoke test at least one official or private server URL.

## Notes

Guest mode is opt-in with `--guest`. It is useful for read-only xxscreeps browsing but can interfere with normal
Steam OpenID login.

The official Screeps browser and Steam clients use undocumented HTTP endpoints. Third-party automation should prefer
Screeps Auth Tokens; this project only proxies normal browser client traffic.

![Safari Example](./docs/safari.png)
