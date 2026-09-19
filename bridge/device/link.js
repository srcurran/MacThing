import { EventEmitter } from 'node:events';
import { config, paths } from '../config.js';
import { log } from '../log.js';
import { adb, shell } from './adb.js';
import { CDP, listTargets } from './cdp.js';
import { isBootInstalled, syncUi } from './deploy.js';

const BINDING = '__carthingSend'; // page → Mac (Runtime.addBinding)
const CONSOLE_MARK = '⁣carthing '; // fallback channel if bindings are unavailable

/**
 * One live connection to a Car Thing: forwards its Chromium devtools port over adb,
 * makes sure the page shows our UI, and relays messages both ways.
 *   Mac → page: Runtime.evaluate(window.__carthingReceive(msg))
 *   page → Mac: window.__carthingSend(json) binding
 *
 * Events: 'ready' (page loaded and wants full state), 'message' (from page), 'close'.
 */
export class DeviceLink extends EventEmitter {
  constructor(serial) {
    super();
    this.serial = serial;
    this.cdp = null;
    this.closed = false;
  }

  async connect() {
    await adb(['forward', `tcp:${config.cdpPort}`, 'tcp:2222'], { serial: this.serial });
    const sync = await syncUi(this.serial, paths.ui, config.deviceUiDir);
    if (sync.changed) log.info(`[device] UI deployed (${sync.version})`);
    this.uiVersion = sync.version;

    const installed = await isBootInstalled(this.serial, config.deviceUiDir);
    this.pageUrl = installed ? config.deviceBootUrl : `file://${config.deviceUiDir}/index.html`;
    if (!installed) log.warn('[device] boot web app not pointed at our UI yet — run `npm run setup-device` so it survives reboots');

    const target = await this.#waitForPage();
    const cdp = await CDP.connect(target.webSocketDebuggerUrl);
    this.cdp = cdp;

    cdp.on('Runtime.bindingCalled', (p) => p.name === BINDING && this.#onPayload(p.payload));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      const text = p.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ');
      if (text.startsWith(CONSOLE_MARK)) this.#onPayload(text.slice(CONSOLE_MARK.length));
      else log.debug('[device console]', text);
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails;
      log.warn('[device] page error:', d.exception?.description || d.text);
    });
    cdp.on('close', () => this.close());

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Runtime.addBinding', { name: BINDING }).catch((e) => log.warn('[device] addBinding failed, using console channel', e.message));

    if (target.url !== this.pageUrl) {
      log.info(`[device] opening UI (was ${target.url})`);
      await cdp.send('Page.navigate', { url: this.pageUrl });
    } else if (sync.changed) {
      await this.reload();
    } else {
      this.emit('ready'); // our UI is already up; it just needs state
    }
  }

  async #waitForPage(timeoutMs = 90000) {
    // Chromium can take a while after a cold boot; keep polling its devtools endpoint.
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const page = (await listTargets(config.cdpPort)).find((t) => t.type === 'page');
        if (page) return page;
      } catch {}
      if (Date.now() > deadline) throw new Error('Chromium devtools not reachable on the device');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  #onPayload(payload) {
    let msg;
    try {
      msg = JSON.parse(payload);
    } catch {
      return log.warn('[device] bad payload', payload.slice(0, 200));
    }
    if (msg.type === 'hello') this.emit('ready');
    this.emit('message', msg);
  }

  send(msg) {
    if (!this.cdp || this.closed) return;
    const expression = `window.__carthingReceive && window.__carthingReceive(${JSON.stringify(msg)})`;
    this.cdp.send('Runtime.evaluate', { expression }).catch((e) => log.debug('[device] send failed', e.message));
  }

  async reload() {
    await this.cdp?.send('Page.reload', { ignoreCache: true });
  }

  async redeploy() {
    const sync = await syncUi(this.serial, paths.ui, config.deviceUiDir);
    if (sync.changed) {
      log.info(`[device] UI redeployed (${sync.version})`);
      await this.reload();
    }
  }

  /** Backlight on/off. The ambient-light daemon is paused while off so it can't relight the screen. */
  async setScreen(on) {
    this.send({ type: 'screen', on });
    const power = '/sys/class/backlight/aml-bl/bl_power';
    await shell(
      this.serial,
      on
        ? `echo 0 > ${power}; supervisorctl start backlight >/dev/null 2>&1; true`
        : `supervisorctl stop backlight >/dev/null 2>&1; echo 4 > ${power}; true`,
      { timeout: 3000 },
    );
  }

  async screenshot() {
    const { data } = await this.cdp.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.cdp?.close();
    } catch {}
    this.emit('close');
  }
}
