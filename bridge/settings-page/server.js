import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { log } from '../log.js';
import { searchPlaces } from '../widgets/weather.js';

const page = fs.readFileSync(new URL('./page.html', import.meta.url));

// The app icon (assets/icon), for the favicon and the page header. A fixed list, so a request
// can't name any other file.
const ICON_DIR = new URL('../../assets/icon/', import.meta.url);
const ICON_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const ICONS = new Map(
  ['macthing.svg', 'macthing-32.png', 'apple-touch-icon.png', 'favicon.ico'].map((name) => [
    name === 'favicon.ico' ? '/favicon.ico' : `/icon/${name}`,
    { file: new URL(name, ICON_DIR), type: ICON_TYPES[path.extname(name)] },
  ]),
);

/**
 * Settings page on http://127.0.0.1:<port> — for things that need typing (weather location),
 * plus the same toggles as the device's settings screen. Loopback only; requests must carry a
 * loopback Host (DNS-rebinding guard), and writes must be same-origin JSON (CSRF guard).
 *
 * @param {{port: number, settings: import('../settings.js').settings, status: () => Promise<object>}} opts
 */
export function startSettingsPage({ port, settings, status }) {
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];

  const server = http.createServer(async (req, res) => {
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (!origins.includes(`http://${req.headers.host}`)) return json(403, { error: 'forbidden' });
    const url = new URL(req.url, origins[0]);

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(page);
      }
      const icon = req.method === 'GET' && ICONS.get(url.pathname);
      if (icon) {
        res.writeHead(200, { 'content-type': icon.type, 'cache-control': 'max-age=86400' });
        return res.end(fs.readFileSync(icon.file));
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        return json(200, { settings: settings.get(), ...(await status()) });
      }
      if (req.method === 'GET' && url.pathname === '/api/places') {
        const q = (url.searchParams.get('q') || '').trim();
        return json(200, { places: q.length < 2 ? [] : await searchPlaces(q) });
      }
      if (req.method === 'POST' && url.pathname === '/api/settings') {
        if (!origins.includes(req.headers.origin) || !req.headers['content-type']?.startsWith('application/json')) {
          return json(403, { error: 'forbidden' });
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 10000) return json(413, { error: 'too large' });
        }
        settings.update(JSON.parse(body));
        return json(200, { settings: settings.get() });
      }
      json(404, { error: 'not found' });
    } catch (err) {
      log.warn('[settings page]', err.message);
      json(500, { error: err.message });
    }
  });

  server.on('error', (err) => log.warn(`[settings page] not available on port ${port}:`, err.message));
  server.listen(port, '127.0.0.1', () => log.info(`[settings page] http://127.0.0.1:${port}`));
  return server;
}
