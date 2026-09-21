import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { log } from '../log.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/tiff': 'tiff', 'image/gif': 'gif', 'image/webp': 'webp' };
const run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );

/**
 * Re-encodes artwork as a square JPEG of at most 480px (the art panel is exactly 480×480) so the
 * device's 2018-era Chromium gets a small, decodable image whatever the source format was
 * (HEIC/TIFF would not render there).
 *
 * The centre crop happens here, at the source's own resolution, rather than in CSS. A 16:9 video
 * thumbnail scaled to fit 480 first is only 270px tall, and filling the square from that means
 * stretching it by 1.8×; cropping 360px of the original and resizing once is visibly sharper.
 */
export class ArtworkCache {
  constructor(maxSize = 480) {
    this.maxSize = maxSize;
    this.cache = new Map(); // key -> Promise<{key, dataUrl, width, height}>
    this.dir = null;
  }

  /** @param {{key: string, mime: string, base64: string}} art */
  get(art) {
    if (!this.cache.has(art.key)) {
      if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(art.key, this.#process(art));
    }
    return this.cache.get(art.key);
  }

  async #process(art) {
    this.dir ??= await fs.mkdtemp(path.join(os.tmpdir(), 'carthing-art-'));
    const src = path.join(this.dir, `${art.key}.${EXT[art.mime] || 'img'}`);
    const out = path.join(this.dir, `${art.key}.out.jpg`);
    try {
      await fs.writeFile(src, Buffer.from(art.base64, 'base64'));
      const srcDims = await run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src]);
      const sw = Number(/pixelWidth: (\d+)/.exec(srcDims)?.[1]) || 0;
      const sh = Number(/pixelHeight: (\d+)/.exec(srcDims)?.[1]) || 0;
      const side = sw && sh ? Math.min(sw, sh) : 0;
      // Two passes on purpose: in one command sips resizes before it crops, which throws away the
      // height of a wide image and leaves a smaller square than the source could give.
      await run('/usr/bin/sips', [
        '-s', 'format', 'jpeg', '-s', 'formatOptions', '88',
        ...(side ? ['-c', String(side), String(side)] : []),
        src, '--out', out,
      ]);
      if (!side || side > this.maxSize) await run('/usr/bin/sips', ['-Z', String(this.maxSize), out, '--out', out]);
      const dims = await run('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out]);
      const width = Number(/pixelWidth: (\d+)/.exec(dims)?.[1]) || 0;
      const height = Number(/pixelHeight: (\d+)/.exec(dims)?.[1]) || 0;
      const jpeg = await fs.readFile(out);
      return { key: art.key, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, width, height };
    } catch (err) {
      log.warn('[artwork] could not convert, sending original', err.message);
      return { key: art.key, dataUrl: `data:${art.mime};base64,${art.base64}`, width: 0, height: 0 };
    } finally {
      fs.rm(src, { force: true }).catch(() => {});
      fs.rm(out, { force: true }).catch(() => {});
    }
  }
}
