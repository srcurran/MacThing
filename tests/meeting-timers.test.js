import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsOnDeck, OVERRUN_MS } from '../ui/src/meeting-timers.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 10, 13, 15);
const ev = (title, start, end) => ({ title, start: T0 + start * MIN, end: T0 + end * MIN });
const titles = list => list.map(e => e.title);
const at = minutes => T0 + minutes * MIN;

test('a meeting going on counts to its end', () => {
  const r = meetingsOnDeck([ev('A', 0, 30)], at(10), false);
  assert.deepEqual(titles(r.going), ['A']);
  assert.deepEqual(r.over, []);
});

test('just over with nothing else counting, it counts on past its end, for OVERRUN_MS', () => {
  const events = [ev('A', 0, 30), ev('Later', 120, 150)]; // the next meeting's countdown to its start doesn't count
  assert.deepEqual(titles(meetingsOnDeck(events, at(30), false).over), ['A']);
  assert.deepEqual(titles(meetingsOnDeck(events, at(30) + OVERRUN_MS - 1, false).over), ['A']);
  assert.deepEqual(meetingsOnDeck(events, at(30) + OVERRUN_MS, false).over, []);
});

test('back to back: the next meeting takes over, with no overrun', () => {
  const r = meetingsOnDeck([ev('A', 0, 30), ev('B', 30, 60)], at(30), false);
  assert.deepEqual(titles(r.going), ['B']);
  assert.deepEqual(r.over, []);
});

test('at the same time: the other meeting carries on, with no overrun', () => {
  const r = meetingsOnDeck([ev('A', 0, 30), ev('B', 0, 60)], at(31), false);
  assert.deepEqual(titles(r.going), ['B']);
  assert.deepEqual(r.over, []);
});

test('a timer of yours running: no overrun', () => {
  assert.deepEqual(meetingsOnDeck([ev('A', 0, 30)], at(31), true).over, []);
});

test('only the meeting that ended last counts on, not one that ended earlier under another', () => {
  const events = [ev('A', 0, 30), ev('B', 0, 35)];
  assert.deepEqual(titles(meetingsOnDeck(events, at(36), false).over), ['B']);
});

test('a removed card stays away, and so does the overrun of a meeting removed while going', () => {
  const hidden = { A: at(30) + OVERRUN_MS };
  const shown = (e, until) => !(hidden[e.title] >= until);
  assert.deepEqual(meetingsOnDeck([ev('A', 0, 30)], at(10), false, shown).going, []);
  assert.deepEqual(meetingsOnDeck([ev('A', 0, 30)], at(31), false, shown).over, []);
  // A hidden meeting going on doesn't hold back another's overrun.
  hidden.A = at(60) + OVERRUN_MS;
  const r = meetingsOnDeck([ev('A', 0, 60), ev('B', 0, 30)], at(31), false, shown);
  assert.deepEqual(titles(r.over), ['B']);
});
