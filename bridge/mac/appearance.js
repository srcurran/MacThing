import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';

const POLL_MS = 5000;

/**
 * Whether macOS is currently in Dark Mode, for the device's "Match Mac" appearance.
 * `defaults read -g AppleInterfaceStyle` prints "Dark" in dark mode and fails in light mode
 * (also true when the Mac switches automatically). Polled; emits 'change' with a boolean.
 */
export class MacAppearance extends EventEmitter {
  constructor() {
    super();
    this.dark = true;
  }

  start() {
    const check = () =>
      execFile('/usr/bin/defaults', ['read', '-g', 'AppleInterfaceStyle'], (err, stdout) => {
        const dark = !err && stdout.trim() === 'Dark';
        if (dark !== this.dark) {
          this.dark = dark;
          this.emit('change', dark);
        }
      });
    check();
    setInterval(check, POLL_MS);
  }
}
