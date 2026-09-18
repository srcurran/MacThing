#!/usr/bin/env node
// Saves what the Car Thing is showing right now: npm run screenshot [out.png]
// Works alongside a running bridge (Chromium accepts several devtools clients).

import fs from 'node:fs';
import { config } from '../bridge/config.js';
import { adb, listCarThings } from '../bridge/device/adb.js';
import { CDP, listTargets } from '../bridge/device/cdp.js';

const out = process.argv[2] || 'carthing.png';
const [device] = await listCarThings();
if (!device) {
  console.error('No Car Thing found over adb');
  process.exit(1);
}
await adb(['forward', `tcp:${config.cdpPort}`, 'tcp:2222'], { serial: device.serial });
const page = (await listTargets(config.cdpPort)).find((t) => t.type === 'page');
const cdp = await CDP.connect(page.webSocketDebuggerUrl);
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(data, 'base64'));
cdp.close();
console.log(`${out}  (${page.url})`);
