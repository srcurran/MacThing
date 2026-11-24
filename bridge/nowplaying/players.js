import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { log } from '../log.js';
import { normalize } from './mediaremote.js';

// Loads native/bin/MacThingPlayers.dylib into perl and calls one of its functions (see players.m).
const PERL_LOADER = `
use DynaLoader;
my $h = DynaLoader::dl_load_file($ARGV[0], 0) or die "can't load $ARGV[0]\\n";
my $f = DynaLoader::dl_find_symbol($h, $ARGV[1]) or die "no $ARGV[1]\\n";
DynaLoader::dl_install_xsub("main::run", $f);
run();
`;

/**
 * Every app with something in Now Playing — what Control Center lists when two apps have media,
 * where MediaRemoteSource only follows the one macOS elected. `players` is a list of snapshots
 * (normalize()'s shape, with `pid`), in the order MediaRemote gives them; 'change' fires when any
 * of them changes.
 *
 * It can't send them commands: MediaRemote delivers a command from us to the player macOS elected,
 * whichever player it names. appCommand() reaches the others it can.
 *
 * Optional: without the library (an older build) the list stays empty and the bridge shows just
 * the elected player, as before.
 */
export class PlayerList extends EventEmitter {
  constructor(binDir) {
    super();
    this.lib = path.join(binDir, 'MacThingPlayers.dylib');
    this.players = [];
    this.raw = [];
    this.proc = null;
    this.stopped = false;
    this.artUrls = new Map(); // artwork URL -> base64 (null while loading or failed)
  }

  get available() {
    return fs.existsSync(this.lib);
  }

  start() {
    this.stopped = false;
    if (!this.available) return log.info('[players] MacThingPlayers.dylib not built: following one player (./native/build.sh)');
    const proc = spawn('/usr/bin/perl', ['-e', PERL_LOADER, this.lib, 'players_stream'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    createInterface({ input: proc.stderr }).on('line', (line) => log.warn('[players]', line));
    proc.on('exit', (code) => {
      this.proc = null;
      if (this.stopped) return;
      log.warn(`[players] stream exited (${code}); restarting in 5s`);
      setTimeout(() => this.start(), 5000);
    });
  }

  stop() {
    this.stopped = true;
    this.proc?.kill();
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return log.warn('[players] unparseable line', line.slice(0, 200));
    }
    if (!Array.isArray(msg.players)) return;
    this.raw = msg.players;
    this.update();
  }

  update() {
    this.players = this.raw.map((raw) => normalize(this.withArtwork(raw))).filter((p) => p.active);
    this.emit('change', this.players);
  }

  /**
   * Apple Music streaming tracks may come with only a link to their cover. It's fetched once, and
   * the list updated when it arrives.
   */
  withArtwork(raw) {
    const url = raw.artworkIdentifier;
    if (raw.artworkData || typeof url !== 'string' || !/^https:\/\/[^/]*mzstatic\.com\//.test(url)) return raw;
    if (this.artUrls.has(url)) {
      const base64 = this.artUrls.get(url);
      return base64 ? { ...raw, artworkData: base64, artworkMimeType: 'image/jpeg' } : raw;
    }
    if (this.artUrls.size > 20) this.artUrls.delete(this.artUrls.keys().next().value);
    this.artUrls.set(url, null);
    fetch(url, { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (!buf) return;
        this.artUrls.set(url, Buffer.from(buf).toString('base64'));
        this.update();
      })
      .catch((err) => log.debug('[players] artwork', err.message));
    return raw;
  }
}

// Apps that take play/pause and skips over AppleScript, for a player macOS didn't elect.
const SCRIPTABLE = { 'com.apple.Music': 'Music', 'com.spotify.client': 'Spotify' };
const VERBS = { playpause: 'playpause', play: 'play', pause: 'pause', next: 'next track', previous: 'previous track' };

/** Whether appCommand() can reach this app. */
export const canCommand = (bundleId) => Boolean(SCRIPTABLE[bundleId]);

/**
 * A media command straight to Music or Spotify (macOS asks once to let the bridge control each).
 * Resolves {ok, error?}.
 */
export function appCommand(bundleId, action) {
  const app = SCRIPTABLE[bundleId], verb = VERBS[action];
  if (!app || !verb) return Promise.resolve({ ok: false, error: `can't send ${action} to ${bundleId}` });
  const source = `if application "${app}" is running then tell application "${app}" to ${verb}`;
  return new Promise((resolve) =>
    // Long timeout: the first run waits on the Automation permission prompt.
    execFile('/usr/bin/osascript', ['-e', source], { timeout: 60000 }, (err, _, stderr) =>
      resolve(err ? { ok: false, error: String(stderr || err.message).trim() } : { ok: true }),
    ),
  );
}

/**
 * Which player the device shows, out of the list. The device steps through them (its Now Playing
 * button pressed again, or a swipe up or down); on its own the choice moves:
 * - to a player that appears (an app starts some media), or one that starts playing,
 * - and off a player that goes away, to the next one playing, else macOS's own choice, else the first.
 * Players are kept in the order they were first seen, so stepping goes round in a stable order.
 */
export class PlayerSelection {
  constructor() {
    this.order = []; // pids, first seen first
    this.playing = new Map(); // pid -> playing, as of the last update
    this.selected = null;
    this.seeded = false;
  }

  /**
   * @param {{pid: number, playing: boolean}[]} players
   * @param {number|null} electedPid the player MediaRemote itself follows
   * @returns {number|null} the selected pid
   */
  update(players, electedPid = null) {
    const pids = players.map((p) => p.pid);
    const appeared = this.seeded ? pids.filter((pid) => !this.playing.has(pid)) : [];
    const started = players.filter((p) => p.playing && this.playing.get(p.pid) === false).map((p) => p.pid);
    this.order = this.order.filter((pid) => pids.includes(pid)).concat(pids.filter((pid) => !this.order.includes(pid)));
    this.playing = new Map(players.map((p) => [p.pid, p.playing]));
    this.seeded = this.seeded || players.length > 0;

    const isPlaying = (pid) => this.playing.get(pid);
    // Of several at once, one that's playing.
    const news = [...appeared, ...started];
    const moveTo = news.find(isPlaying) ?? news[0];
    if (moveTo != null) this.selected = moveTo;
    else if (!pids.includes(this.selected)) {
      this.selected =
        this.order.find(isPlaying) ?? (pids.includes(electedPid) ? electedPid : null) ?? this.order[0] ?? null;
    }
    return this.selected;
  }

  /** Shows the player in process `pid`, if it's in the list. */
  select(pid) {
    if (this.order.includes(pid)) this.selected = pid;
    return this.selected;
  }

  /** Steps `steps` through the players (1 the next, -1 the previous), round in a circle. */
  step(steps) {
    const n = this.order.length;
    if (n < 2) return this.selected;
    const at = Math.max(0, this.order.indexOf(this.selected));
    this.selected = this.order[(((at + steps) % n) + n) % n];
    return this.selected;
  }

  /** {index, count} of the selected player, for the device's indicator. */
  position() {
    return { index: Math.max(0, this.order.indexOf(this.selected)), count: this.order.length };
  }
}
