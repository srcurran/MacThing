import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths } from './config.js';
import { log } from './log.js';

const pkg = JSON.parse(fs.readFileSync(path.join(paths.root, 'package.json'), 'utf8'));
// owner/name from package.json's repository URL, e.g. srcurran/MacThing.
const REPO = (pkg.repository?.url || '').match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
const CHECK_MS = 12 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000; // let the bridge settle (and the network come up at login) first
export const UPDATE_LOG = path.join(os.homedir(), 'Library', 'Logs', 'macthing-update.log');

/** [1, 2, 0] from 'v1.2.0' or '1.2.0'; null for anything else. */
function parseVersion(v) {
  const m = String(v || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}
export function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

const git = (...args) => new Promise((resolve) => {
  execFile('git', args, { cwd: paths.root, timeout: 10000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
});

/**
 * Looks for a newer GitHub release than the version in package.json, and installs it on request
 * with scripts/update.sh. Installing only works from a git clone on main with no local edits, and
 * only when the bridge runs as the login agent: the bridge exits when the update is done, and
 * launchd starts the new version.
 *
 * state: { current, latest, available, url, canUpdate, reason, status, step, error }
 *   status: 'idle' | 'updating' | 'failed'
 *   reason: why canUpdate is false, in words for the settings page
 */
export class Updater extends EventEmitter {
  constructor({ dev = false, onUpdated } = {}) {
    super();
    this.dev = dev;
    this.onUpdated = onUpdated;
    this.state = { current: pkg.version, latest: null, available: false, url: null, canUpdate: false, reason: '', status: 'idle', step: '', error: '' };
  }

  start() {
    if (!REPO) return log.warn('[update] no GitHub repository in package.json; not checking for updates');
    setTimeout(() => this.check(), FIRST_CHECK_MS);
    setInterval(() => this.check(), CHECK_MS);
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('change', this.state);
  }

  async check() {
    if (this.state.status === 'updating') return;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': `MacThing/${pkg.version}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const release = await res.json();
      const latest = String(release.tag_name || '').replace(/^v/, '');
      const available = isNewer(latest, pkg.version);
      if (available && !this.state.available) log.info(`[update] MacThing ${latest} is available (this is ${pkg.version})`);
      this.set({ latest, available, url: release.html_url || null, ...(available ? await this.installable() : { canUpdate: false, reason: '' }) });
    } catch (err) {
      log.debug('[update] check failed:', err.message);
    }
  }

  /** Whether "Update now" can work here, and if not, why. */
  async installable() {
    const no = (reason) => ({ canUpdate: false, reason });
    if (this.dev) return no('This is a dev run. Use git to update.');
    if (!fs.existsSync(path.join(paths.root, '.git'))) return no('This copy wasn’t installed with git clone. Download the new version from GitHub.');
    const branch = await git('symbolic-ref', '--short', '-q', 'HEAD');
    if (branch !== 'main') return no(`This copy is on ${branch ? `the ${branch} branch` : 'no branch'}, not main. Use git to update.`);
    const dirty = await git('status', '--porcelain', '--untracked-files=no');
    if (dirty === null || dirty !== '') return no('This copy has local changes. Commit or stash them, then run npm run update.');
    // Running from the login agent: launchd is the parent and starts the bridge again after it exits.
    if (process.ppid !== 1) return no('The bridge isn’t running as the login agent. Run npm run update in Terminal.');
    return { canUpdate: true, reason: '' };
  }

  /** Runs scripts/update.sh, then lets the bridge exit so launchd starts the new version. */
  async install() {
    if (this.state.status === 'updating') return;
    const ok = await this.installable();
    if (!ok.canUpdate) return this.set({ ...ok, status: 'failed', error: ok.reason });
    this.set({ status: 'updating', step: 'Starting', error: '' });
    log.info(`[update] installing MacThing ${this.state.latest} (log: ${UPDATE_LOG})`);

    const out = fs.createWriteStream(UPDATE_LOG, { flags: 'a' });
    out.write(`\n=== ${new Date().toISOString()} update from ${pkg.version} ===\n`);
    const child = spawn('/bin/zsh', [path.join(paths.root, 'scripts', 'update.sh'), '--no-restart'], { cwd: paths.root });
    let tail = '';
    const read = (chunk) => {
      const text = chunk.toString();
      out.write(text);
      tail = (tail + text).slice(-2000);
      // The script names each step on a line starting with "▸ ".
      for (const line of text.split('\n')) if (line.startsWith('▸ ')) this.set({ step: line.slice(2).trim() });
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('close', (code) => {
      out.end();
      if (code === 0) {
        log.info('[update] done; restarting into the new version');
        this.set({ step: 'Restarting' });
        return this.onUpdated?.();
      }
      // The last line the script printed says what went wrong.
      const lastLine = tail.trim().split('\n').filter(Boolean).pop() || `exit code ${code}`;
      log.warn(`[update] failed: ${lastLine}`);
      this.set({ status: 'failed', step: '', error: lastLine });
    });
  }
}
