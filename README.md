# Screeps Steamless Client

## About
This package serves the [Screeps World](https://store.steampowered.com/app/464350/Screeps/) Steam
client in the browser of your choice. It works by reading the `package.nw` file from a legally
installed Steam copy and proxying the client to the official server, PTR, seasonal worlds, or a
private/community server.

I personally run into a lot of issues with the official client, especially on macOS. The official
client is simply an [NW.js](https://nwjs.io/) wrapper around an [AngularJS](https://angularjs.org/)
app. The version of NW.js included with the client is fairly ancient; at the time of this writing it
was based on Chrome 76 [July 2019] -- a two year old version. I made this package because I was
experiencing frequent crashes in the official client, and I desired a native experience on my Apple
M1-based computer.

The client files still come from your local Steam installation, so keep Screeps updated through
Steam. Copying `package.nw` from another machine works, but you will need to refresh that copy when
Steam ships a new client.


## Installation & Use
```
npm install -g screeps-steamless-client
npx screeps-steamless-client
```

You must visit a specially crafted local URL in order to specify the server you want to connect to.
In order to connect to the official Screeps World server you would visit:
http://localhost:8080/(https://screeps.com)/.

PTR and seasonal worlds use the backend path:
http://localhost:8080/(https://screeps.com/ptr)/ and
http://localhost:8080/(https://screeps.com/season)/.

In order to visit a local server running on port 21025 you would visit:
http://localhost:8080/(http://localhost:21025)/. Note that Steam OpenId support is required on your
local server which can be enabled with
[screepsmod-auth](https://github.com/ScreepsMods/screepsmod-auth). For xxscreeps servers this should
be enabled by default.

The final "/" at the end of the URI is important - you'll receive an error if you omit it.

### Locating Screeps World client

This package requires Screeps World to be installed. It now checks common Steam locations on macOS,
Windows, Linux, WSL, Flatpak, and Snap installs. If it cannot find the file, provide it with
`--package`:

`npx screeps-steamless-client --package ~/Screeps/package.nw`

### Configuring host interface and port

By default the package listens on `localhost:8080`. Change the bind address with `--host` and
`--port`. If the client runs behind Docker or a reverse proxy, set the public URL components so
rewritten history URLs point at the address browsers can actually reach:

```
npx screeps-steamless-client --host 0.0.0.0
npx screeps-steamless-client --public_hostname screeps-client.example.com --public_port 443 --public_tls
```

Use `--internal_backend` when the backend address visible to the proxy is different from the backend
address visible to the browser, for example inside Docker:

`npx screeps-steamless-client --backend http://localhost:21025 --internal_backend http://screeps:21025`

### Arguments

- `--package <path>`: path to `package.nw`.
- `--host <host>` and `--port <port>`: bind interface and port.
- `--backend <url>`: proxy one backend directly instead of using the URL wrapper form.
- `--internal_backend <url>`: backend URL used by the proxy process.
- `--public_hostname <host>`, `--public_port <port>`, `--public_tls`: public browser-facing URL.
- `--guest`: enable xxscreeps guest mode.
- `--beautify`: format served JavaScript for debugging.

## Tips
Guest mode is now opt-in with `--guest`, matching current community client behavior. It is useful
for [xxscreeps](https://github.com/laverdet/xxscreeps/) read-only browsing, but can get in the way
of normal Steam OpenID login.

The official Screeps documentation notes that the browser and Steam clients use undocumented HTTP
endpoints. Third-party tools should prefer Screeps Auth Tokens for external automation, while this
proxy should continue to forward normal browser client authentication traffic.

![Safari Example](./docs/safari.png)
