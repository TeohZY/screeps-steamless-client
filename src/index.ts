#!/usr/bin/env node
import os from 'os';
import path from 'path';
import { existsSync, promises as fs } from 'fs';
import { Transform } from 'stream';
import { ArgumentParser } from 'argparse';
import httpProxy from 'http-proxy';
import Koa from 'koa';
import koaConditionalGet from 'koa-conditional-get';
import jsBeautify from 'js-beautify';
import JSZip from 'jszip';
import fetch from 'node-fetch';

// Parse program arguments
const argv = function() {
	const parser = new ArgumentParser;
	parser.add_argument('--beautify', {
		action: 'store_true',
		default: false,
	});
	parser.add_argument('--package', {
		nargs: '?',
		type: 'str',
	});
	parser.add_argument('--port', {
		nargs: '?',
		type: 'int',
	});
	parser.add_argument('--backend', {
		nargs: '?',
		type: 'str',
	});
	parser.add_argument('--host', {
		nargs: '?',
		type: 'str',
	});
	parser.add_argument('--public_hostname', {
		nargs: '?',
		type: 'str',
	});
	parser.add_argument('--public_port', {
		nargs: '?',
		type: 'int',
	});
	parser.add_argument('--public_tls', {
		action: 'store_true',
		default: false,
	});
	parser.add_argument('--internal_backend', {
		nargs: '?',
		type: 'str',
	});
	parser.add_argument('--guest', {
		action: 'store_true',
		default: false,
	});
	return parser.parse_args();
}();

const beautify = argv.beautify;

// Create proxy
const proxy = httpProxy.createProxyServer({
	changeOrigin: true,
});
proxy.on('error', err => console.error(err));

const getScreepsPackagePath = (steamPath: string) => {
	const screepsPath = path.join(steamPath, 'steamapps', 'common', 'Screeps', 'package.nw');
	if (existsSync(screepsPath)) {
		return screepsPath;
	}
};

const getScreepsPath = () => {
	switch (process.platform) {
		case 'darwin':
			return getScreepsPackagePath(path.join(os.homedir(), 'Library', 'Application Support', 'Steam'));
		case 'linux':
			if (process.env.WSL_DISTRO_NAME) {
				for (const drive of [ 'c', 'd', 'e' ]) {
					const screepsPath = getScreepsPackagePath(path.join('/mnt', drive, 'Program Files (x86)', 'Steam'));
					if (screepsPath) {
						return screepsPath;
					}
				}
			}
			for (const dir of [
				[ '.steam', 'root', 'steam' ],
				[ '.steam', 'steam' ],
				[ '.local', 'share', 'Steam' ],
				[ '.var', 'app', 'com.valvesoftware.Steam', '.steam' ],
				[ 'snap', 'steam' ],
			]) {
				const screepsPath = getScreepsPackagePath(path.join(os.homedir(), ...dir));
				if (screepsPath) {
					return screepsPath;
				}
			}
			return;
		case 'win32':
			return getScreepsPackagePath(path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Steam'));
		default:
			break;
	}
};

// Locate and read `package.nw`
const [ data, stat ] = await async function() {
	const packagePath = argv.package ?? getScreepsPath();
	if (!packagePath) {
		console.log('Could not find `package.nw`. Please check `--package` argument');
		process.exit(1);
	}
	return Promise.all([ fs.readFile(packagePath), fs.stat(packagePath) ]);
}();

// Read package zip metadata
const zip = new JSZip;
await zip.loadAsync(data);
const { files } = zip;

// HTTP header is only accurate to the minute
const lastModified = stat.mtime;

// Set up koa server
const koa = new Koa;
const port = argv.port ?? 8080;
const host = argv.host ?? 'localhost';
const publicPort = argv.public_port ?? port;
const publicHost = argv.public_hostname ?? host;
const publicOrigin = `${argv.public_tls ? 'https' : 'http'}://${publicHost}:${publicPort}`;
const server = koa.listen(port, host);
server.on('error', err => console.error(err));
const normalizeBackend = (backend: string) => {
	try {
		return new URL(backend).toString().replace(/\/+$/, '');
	} catch (err) {}
};
const extract = (url: string) => {
	if (argv.backend) {
		const backend = normalizeBackend(argv.backend);
		if (backend) {
			return {
				backend,
				endpoint: url,
			};
		}
	}
	const groups = /^\/\((?<backend>[^)]+)\)(?<endpoint>\/.*)$/.exec(url)?.groups;
	if (groups) {
		const backend = normalizeBackend(groups.backend);
		if (backend) {
			return {
				backend,
				endpoint: groups.endpoint,
			};
		}
	}
};
const getBackendPath = (backend: string) => new URL(backend).pathname.replace(/\/+$/, '');
const proxied = (backend: string, endpoint: string) => argv.backend ? endpoint : `/(${backend})${endpoint}`;

// Serve client assets directly from steam package
koa.use(koaConditionalGet());
koa.use(async(context, next) => {
	const info = extract(context.path);
	if (!info) {
		console.log('Unknown URL', context.path, info);
		return;
	}
	const path = info.endpoint === '/' ?
		'index.html' : info.endpoint.slice(1);
	const file = files[path];
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	if (!file) {
		return next();
	}

	// Check cached response based on zip file modification
	context.lastModified = lastModified;
	if (context.fresh) {
		return;
	}

	// Rewrite various payloads
	context.body = await async function() {
		if (path === 'index.html') {
			let body = await file.async('text');
			// Inject startup shim
			const header = '<title>Screeps</title>';
			const clientBasePath = argv.backend ? '/' : `/(${info.backend})/`;
			body = body.replace(header, `<script>
if (localStorage.backendDomain && localStorage.backendDomain !== ${JSON.stringify(info.backend)}) {
	const keysToPreserve = ['game.room.displayOptions', 'game.world-map.displayOptions2', 'game.editor.hidden'];
	for (const key of Object.keys(localStorage)) {
		if (!keysToPreserve.includes(key)) {
			localStorage.removeItem(key);
		}
	}
}
localStorage.backendDomain = ${JSON.stringify(info.backend)};
localStorage.tutorialVisited = 'true';
localStorage.placeSpawnTutorialAsked = '1';
localStorage.tipTipOfTheDay = '-1';
try {
	const authCookie = document.cookie.match(/(?:^|; )auth_token=([^;]+)/);
	if (authCookie) {
		const token = decodeURIComponent(authCookie[1]);
		if (localStorage.auth !== JSON.stringify(token)) {
			localStorage.auth = JSON.stringify(token);
		}
	}
} catch (err) {}
if (${JSON.stringify(argv.guest)}) {
	if (
		(localStorage.auth === 'null' && localStorage.prevAuth === 'null') ||
		60 * 60 * 1000 < Date.now() - localStorage.lastToken ||
		(localStorage.prevAuth !== '"guest"' && (localStorage.auth === 'null' || !localStorage.auth))
	) {
		localStorage.auth = '"guest"';
	}
	localStorage.prevAuth = localStorage.auth;
	localStorage.lastToken = Date.now();
	let auth = localStorage.auth;
	setInterval(() => {
		if (auth !== localStorage.auth) {
			auth = localStorage.auth;
			localStorage.lastToken = Date.now();
		}
	}, 1000);
}
// The client will just fill this up with data until the application breaks.
if (localStorage['users.code.activeWorld']?.length > 1024 * 1024) {
	try {
		const code = JSON.parse(localStorage['users.code.activeWorld']);
		localStorage['users.code.activeWorld'] = JSON.stringify(code.sort((left, right) => right.timestamp - left.timestamp).slice(0, 2))
	} catch (err) {
		delete localStorage['users.code.activeWorld']
	}
}
// Send the user to map after login from /register
addEventListener('message', event => {
	setTimeout(() => {
		if (localStorage.auth) {
			const isGuestOrNull = localStorage.auth === '"guest"' || localStorage.auth === 'null';
			const basePath = ${JSON.stringify(clientBasePath)};
			if (isGuestOrNull && document.location.pathname === basePath + 'season/') {
				document.location.pathname = basePath;
			} else if (!isGuestOrNull && document.location.hash === '#!/register') {
				document.location.hash = '#!/'
			}
		}
	});
});
			</script>` + header);
			// Remove tracking pixels
			body = body.replace(/<script[^>]*>[^>]*xsolla[^>]*<\/script>/g, '<script>xnt = new Proxy(() => xnt, { get: () => xnt })</script>');
			body = body.replace(/<script[^>]*>[^>]*facebook[^>]*<\/script>/g, '<script>fbq = new Proxy(() => fbq, { get: () => fbq })</script>');
			body = body.replace(/<script[^>]*>[^>]*google[^>]*<\/script>/g, '<script>ga = new Proxy(() => ga, { get: () => ga })</script>');
			body = body.replace(/<script[^>]*>[^>]*mxpnl[^>]*<\/script>/g, '<script>mixpanel = new Proxy(() => mixpanel, { get: () => mixpanel })</script>');
			body = body.replace(/<script[^>]*>[^>]*twttr[^>]*<\/script>/g, '<script>twttr = new Proxy(() => twttr, { get: () => twttr })</script>');
			body = body.replace(/<script[^>]*>[^>]*reddit[^>]*<\/script>/g, '<script>rdt = new Proxy(() => rdt, { get: () => rdt })</script>');
			body = body.replace(/<script[^>]*>[^>]*onRecaptchaLoad[^>]*<\/script>/g, '<script>function onRecaptchaLoad(){}</script>');
			return body;
		} else if (path === 'config.js') {
			const backendUrl = new URL(info.backend);
			const backendPath = getBackendPath(info.backend);
			const isPtr = backendUrl.hostname === 'screeps.com' && backendPath === '/ptr';
			const isSeason = backendUrl.hostname === 'screeps.com' && backendPath === '/season';
			const historyBackend = isSeason ? backendUrl.origin : info.backend;
			const history = `${proxied(historyBackend, '/room-history')}/`;
			const api = `${proxied(info.backend, '/api')}/`;
			const socket = `${proxied(info.backend, '/socket')}/`;
			const prefix = backendPath.slice(1);
			// Screeps server config
			return `
				var HISTORY_URL = '${history}';
				var API_URL = '${api}';
				var WEBSOCKET_URL = '${socket}';
				var CONFIG = {
					API_URL: API_URL,
					HISTORY_URL: HISTORY_URL,
					WEBSOCKET_URL: WEBSOCKET_URL,
					PREFIX: '${prefix}',
					IS_PTR: ${isPtr},
					PTR: ${isPtr},
					DEBUG: false,
					XSOLLA_SANDBOX: false,
				};
			`;
		} else if (context.path.endsWith('.js')) {
			let text = await file.async('text');
			if (path === 'build.min.js') {
				// Load backend info from underlying server
				const backend = new URL(info.backend);
				const version = await async function() {
					try {
						const response = await fetch(`${argv.internal_backend ?? info.backend}/api/version`);
						return JSON.parse(await response.text());
					} catch (err) {}
				}();
				const official = backend.hostname === 'screeps.com' || version?.serverData?.features?.find((f: any) => f.name.toLowerCase() === 'official-like');

				// Look for server options payload in build information
				for (const match of text.matchAll(/\boptions=\{/g)) {
					for (let ii = match.index!; ii < text.length; ++ii) {
						if (text.charAt(ii) === '}') {
							try {
								const payload = text.substring(match.index!, ii + 1);
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const holder =
								// eslint-disable-next-line @typescript-eslint/no-implied-eval
								new Function(payload);
								if (payload.includes('apiUrl')) {
									// Inject `protocol`, `host`, `port`, and `official`
									text = `${text.slice(0, ii)},
										protocol: ${JSON.stringify(backend.protocol)},
										host: ${JSON.stringify(backend.hostname)},
										port: ${backend.port || (backend.protocol === 'https:' ? '443' : '80')},
										official: ${official},
									} ${text.slice(ii + 1)}`;
								}
								break;
							} catch (err) {}
						}
					}
				}
				if (backend.hostname !== 'screeps.com') {
					// Replace room-history URL
					const historyUrl = publicOrigin + proxied(info.backend, '/room-history');
					text = text.replace(/http:\/\/"\+s\.options\.host\+":"\+s\.options\.port\+"\/room-history/g, historyUrl);

					// Replace official CDN with local assets
					text = text.replace(/https:\/\/d3os7yery2usni\.cloudfront\.net/g, `${info.backend}/assets`);
				}
				text = text.replace(/"http:\/\/"\+(?<options>[^.]+)\.options\.host/g, '$<options>.options.protocol+"//"+$<options>.options.host');
			}
			return beautify ? jsBeautify(text) : text;

		} else {
			// JSZip doesn't implement their read stream correctly and it causes EPIPE crashes. Pass it
			// through a no-op transform stream first to iron that out.
			const stream = new Transform;
			stream._transform = function(chunk, encoding, done) {
				this.push(chunk, encoding);
				done();
			};
			file.nodeStream().pipe(stream);
			return stream;
		}
	}();

	// Set content type
	context.set('Content-Type', {
		'.css': 'text/css',
		'.html': 'text/html',
		'.js': 'text/javascript',
		'.map': 'application/json',
		'.png': 'image/png',
		'.svg': 'image/svg+xml',
		'.ttf': 'font/ttf',
		'.woff': 'font/woff',
		'.woff2': 'font/woff2',
	}[/\.[^.]+$/.exec(path.toLowerCase())?.[0] ?? '.html']!);

	// We can safely cache explicitly-versioned resources forever
	if (context.request.query.bust) {
		context.set('Cache-Control', 'public,max-age=31536000,immutable');
	}
});

// Proxy API requests to Screeps server
koa.use(async(context, next) => {
	if (context.header.upgrade) {
		context.respond = false;
	} else {
		const info = extract(context.url);
		if (info) {
			context.respond = false;
			context.req.url = info.endpoint;
			if (info.endpoint.startsWith('/api/auth')) {
				const returnUrl = encodeURIComponent(info.backend);
				const separator = info.endpoint.endsWith('?') ? '' : info.endpoint.includes('?') ? '&' : '?';
				context.req.url = `${info.endpoint}${separator}returnUrl=${returnUrl}`;
			}
			proxy.web(context.req, context.res, {
				target: argv.internal_backend ?? info.backend,
			});
			return;
		}
		return next();
	}
});

// Proxy WebSocket requests
server.on('upgrade', (req, socket, head) => {
	const info = extract(req.url!);
	if (info && req.headers.upgrade?.toLowerCase() === 'websocket') {
		req.url = info.endpoint;
		proxy.ws(req, socket, head, {
			target: argv.internal_backend ?? info.backend,
		});
		socket.on('error', err => console.error(err));
	} else {
		socket.end();
	}
});

console.log(
	`🌎 Listening -- http://${host}:${port}/${
		argv.backend ? '' : '(https://screeps.com)/'
	}`,
);
