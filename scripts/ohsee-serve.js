#!/usr/bin/env node
// Serves the UI for ohsee visual tests: npm run ohsee:serve [-- --base <git ref>]
//
// ohsee compares a "prod" build against a "dev" build of the same screens. Here, prod is the UI as
// it is on the base ref (origin/main by default) and dev is this checkout's UI, rebuilt whenever a
// file in ui/ changes. Both are served as plain static files, the way the device loads them:
//
//   prod  http://127.0.0.1:4861   the base ref's UI (built once into .ohsee/baseline)
//   dev   http://127.0.0.1:4862   this checkout's dist/ui (vite build --watch)
//
// Nothing here talks to the Car Thing or the bridge: ohsee drives the page with fixture data in its
// own Chromium (ohsee/screens.js), so it's safe to run at any time.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'origin/main';
const PROD_PORT = 4861;
const DEV_PORT = 4862;
const baselineDir = path.join(root, '.ohsee', 'baseline');
const baselineSrc = path.join(baselineDir, 'src');
const baselineUi = path.join(baselineDir, 'src', 'dist', 'ui');
const devUi = path.join(root, 'dist', 'ui');
const vite = path.join(root, 'node_modules', '.bin', 'vite');

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

function buildBaseline() {
  if (base.startsWith('origin/')) {
    try { git('fetch', '--quiet', 'origin', base.slice('origin/'.length)); } catch { /* offline: use what we have */ }
  }
  const sha = git('rev-parse', '--short', base);
  const stamp = path.join(baselineDir, 'sha');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === sha && fs.existsSync(baselineUi)) {
    console.log(`prod: ${base} (${sha}), already built`);
    return;
  }
  console.log(`prod: building ${base} (${sha})…`);
  fs.rmSync(baselineSrc, { recursive: true, force: true });
  fs.mkdirSync(baselineSrc, { recursive: true });
  // Only what the UI build reads; node_modules is shared with this checkout.
  const tar = execFileSync('git', ['archive', base, 'ui', 'vite.config.js', 'package.json'], { cwd: root });
  execFileSync('tar', ['-x', '-C', baselineSrc], { input: tar });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(baselineSrc, 'node_modules'));
  execFileSync(vite, ['build', '--logLevel', 'warn'], { cwd: baselineSrc, stdio: 'inherit' });
  fs.writeFileSync(stamp, sha);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

function serve(dir, port, label) {
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  }).listen(port, '127.0.0.1', () => console.log(`${label}: http://127.0.0.1:${port}`));
}

buildBaseline();
serve(baselineUi, PROD_PORT, 'prod');

// The first dev build has to land before ohsee can load it; after that, watch keeps it current.
console.log('dev: building this checkout…');
execFileSync(vite, ['build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
serve(devUi, DEV_PORT, 'dev');
const watch = spawn(vite, ['build', '--watch', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
process.on('SIGINT', () => { watch.kill(); process.exit(0); });
process.on('SIGTERM', () => { watch.kill(); process.exit(0); });
