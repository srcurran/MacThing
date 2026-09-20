import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adb, shell } from './adb.js';

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name))])),
  );
  return files.flat().sort();
}

/** Content hash of the local UI folder; the device keeps the deployed hash in <ui>/.version. */
export async function uiVersion(localDir) {
  const hash = createHash('sha1');
  for (const rel of await listFiles(localDir)) {
    hash.update(rel).update('\0').update(await fs.readFile(path.join(localDir, rel))).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Pushes the UI to the device if it changed. Swaps directories so a half-copied UI is never live. */
export async function syncUi(serial, localDir, remoteDir, { force = false } = {}) {
  const version = await uiVersion(localDir);
  const current = (await shell(serial, `cat ${remoteDir}/.version 2>/dev/null; true`)).trim();
  if (!force && current === version) return { version, changed: false };

  const staging = `${remoteDir}.new`;
  await shell(serial, `rm -rf ${staging} && mkdir -p ${staging}`);
  await adb(['push', `${localDir}/.`, staging], { serial, timeout: 120000 });
  await shell(serial, `echo ${version} > ${staging}/.version && rm -rf ${remoteDir} && mv ${staging} ${remoteDir} && sync`);
  return { version, changed: true };
}

/** Single-quoted for the device's shell. */
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Keeps the device-side sleep watchdog in step with device/sleepd.sh and bridge/config.js.
 * Does nothing unless scripts/setup-device.sh has registered it with supervisord — installing it
 * means editing /etc/supervisord.conf on the read-only rootfs, which is a setup job, not
 * something the bridge should be doing behind the user's back.
 */
export async function syncSleepd(serial, localScript, remoteDir, conf) {
  const registered = (await shell(serial, `grep -q '^\\[program:carthing-sleep\\]' /etc/supervisord.conf && echo yes; true`)).trim() === 'yes';
  if (!registered) return { installed: false, changed: false };

  const script = await fs.readFile(localScript);
  const lines = Object.entries(conf).map(([k, v]) => `${k}=${v}`);
  const version = createHash('sha1').update(script).update(lines.join('\n')).digest('hex').slice(0, 12);
  // Read the config back rather than trusting the stamp alone: a sleep.conf edited on the device
  // would otherwise keep its own idle and wake times for as long as the stamp matched.
  const SPLIT = '--8<--';
  const out = await shell(serial, `cat ${remoteDir}/sleepd.version 2>/dev/null; echo '${SPLIT}'; cat ${remoteDir}/sleep.conf 2>/dev/null; true`);
  const [current = '', onDevice = ''] = out.replace(/\r/g, '').split(SPLIT);
  if (current.trim() === version && onDevice.trim() === lines.join('\n')) return { installed: true, changed: false };

  await adb(['push', localScript, `${remoteDir}/sleepd.sh`], { serial });
  await shell(
    serial,
    `printf '%s\\n' ${lines.map(q).join(' ')} > ${remoteDir}/sleep.conf && ` +
      `chmod +x ${remoteDir}/sleepd.sh && echo ${version} > ${remoteDir}/sleepd.version && sync; ` +
      `supervisorctl restart carthing-sleep >/dev/null 2>&1; true`,
  );
  return { installed: true, changed: true };
}

/** True once scripts/setup-device.sh has pointed the boot web app at the UI folder. */
export async function isBootInstalled(serial, remoteDir) {
  const target = (await shell(serial, 'readlink /usr/share/qt-superbird-app/webapp; true')).trim();
  return target === remoteDir;
}
