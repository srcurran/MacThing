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

/** True once scripts/setup-device.sh has pointed the boot web app at the UI folder. */
export async function isBootInstalled(serial, remoteDir) {
  const target = (await shell(serial, 'readlink /usr/share/qt-superbird-app/webapp; true')).trim();
  return target === remoteDir;
}
