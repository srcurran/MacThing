import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchingTab } from '../bridge/nowplaying/browser-control.js';

const listing = [
  'w-abc\t1\tInbox (3) - Mail',
  'w-abc\t9\tBig Tech lost big | The Vergecast - YouTube',
  '1234\t2\t(2) Some other video - YouTube',
].join('\n');

test('finds the playing tab by its title, keeping a text window id', () => {
  assert.deepEqual(matchingTab(listing, 'Big Tech lost big | The Vergecast'), { win: 'w-abc', tab: 9 });
});

test('a numeric window id, and an unread count in the title', () => {
  assert.deepEqual(matchingTab(listing, 'Some other video'), { win: '1234', tab: 2 });
});

test('no tab, or two tabs with the same title: none', () => {
  assert.equal(matchingTab(listing, 'Not open anywhere'), null);
  assert.equal(matchingTab(`${listing}\n5\t1\tSome other video - YouTube`, 'Some other video'), null);
  assert.equal(matchingTab(listing, ''), null);
});
