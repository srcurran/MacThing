// Which meetings have a card on the timer deck (timer.js builds the cards). Plain functions over
// the calendar's events, with no Vue, so the tests can drive them.

// A finished countdown (a timer of yours, or a meeting's) counts on past its end for this long at
// most, then puts itself away.
export const OVERRUN_MS = 10 * 60000;

/**
 * The meetings on the deck at `now`, from the timed events: { going, over }.
 * going: those going on now that are shown, the one ending first first.
 * over: a meeting that has just ended counts on past its end (1:23+) for OVERRUN_MS, but only
 * while nothing else is counting: no meeting going on and no timer of yours running
 * (timerRunning). Then there's another countdown to watch (back-to-back meetings, say), so the
 * screen goes to that instead. Only the meeting that ended last (or those, ending together)
 * counts on, so one that ended earlier, while another meeting ran, doesn't come back.
 * shown(e, until) says whether the card is shown (not removed) until that time.
 */
export function meetingsOnDeck(events, now, timerRunning, shown = () => true) {
  const going = events.filter(e => e.start <= now && now < e.end && shown(e, e.end + OVERRUN_MS))
    .sort((a, b) => a.end - b.end || a.start - b.start);
  if (going.length || timerRunning) return { going, over: [] };
  const ended = events.filter(e => e.start < e.end && e.end <= now && now < e.end + OVERRUN_MS);
  const last = ended.reduce((at, e) => Math.max(at, e.end), -Infinity);
  return { going, over: ended.filter(e => e.end === last && shown(e, e.end + OVERRUN_MS)) };
}
