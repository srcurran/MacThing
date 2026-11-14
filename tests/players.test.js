import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlayerSelection } from '../bridge/nowplaying/players.js';

const p = (pid, playing = true) => ({ pid, playing });

test('starts on the one playing, else the one macOS elected', () => {
  assert.equal(new PlayerSelection().update([p(1, false), p(2)]), 2);
  assert.equal(new PlayerSelection().update([p(1, false), p(2, false)], 2), 2);
  assert.equal(new PlayerSelection().update([p(1, false), p(2, false)]), 1);
  assert.equal(new PlayerSelection().update([]), null);
});

test('a player that opens is shown', () => {
  const s = new PlayerSelection();
  s.update([p(1)]);
  assert.equal(s.update([p(1), p(2, false)]), 2);
});

test('of two that open at once, the one playing is shown', () => {
  const s = new PlayerSelection();
  s.update([p(1)]);
  assert.equal(s.update([p(1), p(2, false), p(3)]), 3);
});

test('a player that starts playing is shown', () => {
  const s = new PlayerSelection();
  s.update([p(1), p(2, false)]);
  assert.equal(s.selected, 1);
  assert.equal(s.update([p(1), p(2)]), 2);
});

test('when the shown player closes, the next one playing takes over', () => {
  const s = new PlayerSelection();
  s.update([p(1, false), p(2), p(3, false)]);
  s.step(-1); // onto 1
  assert.equal(s.selected, 1);
  assert.equal(s.update([p(2), p(3, false)]), 2);
});

test('when the shown player closes and nothing plays, the elected one, else the first', () => {
  const s = new PlayerSelection();
  s.update([p(1, false), p(2, false), p(3, false)]);
  assert.equal(s.update([p(2, false), p(3, false)], 3), 3);
  assert.equal(s.update([p(2, false)], null), 2);
});

test('stepping goes round in the order players were first seen', () => {
  const s = new PlayerSelection();
  s.update([p(1), p(2, false)]);
  s.update([p(3, false), p(1), p(2, false)]); // 3 opens: shown, and last in the order
  assert.deepEqual(s.order, [1, 2, 3]);
  assert.equal(s.step(1), 1);
  assert.equal(s.step(1), 2);
  assert.equal(s.step(-1), 1);
  assert.equal(s.step(-1), 3);
  assert.deepEqual(s.position(), { index: 2, count: 3 });
});

test('a choice made by stepping stays while nothing opens or starts', () => {
  const s = new PlayerSelection();
  s.update([p(1), p(2, false)]);
  s.step(1);
  assert.equal(s.update([p(1), p(2, false)]), 2);
  assert.equal(s.update([p(1, false), p(2, false)]), 2); // 1 pausing doesn't move it
});

test('one player: stepping does nothing', () => {
  const s = new PlayerSelection();
  s.update([p(1)]);
  assert.equal(s.step(1), 1);
});
