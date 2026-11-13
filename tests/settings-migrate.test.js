import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_VIEWS, VALID, migrate } from '../bridge/settings.js';

test('Sleep set to With Mac kept the screen off while locked: no screens now', () => {
  assert.deepEqual(migrate({ screenSleep: 'mac', whenLocked: 'clock' }).whenLocked, []);
  assert.deepEqual(migrate({}).whenLocked, []); // the old default Sleep was With Mac
});

test('other Sleep settings keep their When Mac is locked choice, as a list', () => {
  assert.deepEqual(migrate({ screenSleep: 30, whenLocked: 'clock' }).whenLocked, ['clock', 'timer', 'claude', 'chatgpt']);
  assert.deepEqual(migrate({ screenSleep: 30, whenLocked: 'calendar' }).whenLocked, ['schedule', 'month']);
  assert.deepEqual(migrate({ screenSleep: 'never' }).whenLocked, ALL_VIEWS); // the old default: everything
});

test('runs once: a later choice is left alone', () => {
  const raw = migrate({ screenSleep: 'mac' });
  raw.whenLocked = ['weather'];
  assert.deepEqual(migrate(raw).whenLocked, ['weather']);
});

test('only known views, once each, in top-button order', () => {
  assert.equal(VALID.whenLocked(['nowplaying', 'month', 'weather-week', 'timer']), true);
  assert.equal(VALID.whenLocked([]), true);
  assert.equal(VALID.whenLocked(ALL_VIEWS), true);
  assert.equal(VALID.whenLocked(['timer', 'nowplaying']), false);
  assert.equal(VALID.whenLocked(['clock', 'clock']), false);
  assert.equal(VALID.whenLocked(['settings']), false);
  assert.equal(VALID.whenLocked(['calendar']), false);
  assert.equal(VALID.whenLocked('clock'), false);
});
