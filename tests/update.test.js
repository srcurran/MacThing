import assert from 'node:assert/strict';
import test from 'node:test';
import { isNewer } from '../bridge/update.js';

test('a higher release is newer', () => {
  assert.equal(isNewer('1.1.0', '1.0.0'), true);
  assert.equal(isNewer('v2.0.0', '1.9.9'), true);
  assert.equal(isNewer('1.0.10', '1.0.9'), true);
});

test('the same or an older release is not', () => {
  assert.equal(isNewer('1.0.0', '1.0.0'), false);
  assert.equal(isNewer('0.9.0', '1.0.0'), false);
  assert.equal(isNewer('1.0.9', '1.0.10'), false);
});

test('anything that is not a plain version is not newer', () => {
  assert.equal(isNewer('', '1.0.0'), false);
  assert.equal(isNewer('1.1.0-beta', '1.0.0'), false);
  assert.equal(isNewer(null, '1.0.0'), false);
});
