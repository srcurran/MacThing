import { EventEmitter } from 'node:events';
import { log } from '../log.js';

const REFRESH_MS = 5 * 60 * 1000;
const DAYS_AHEAD = 7;

/**
 * Upcoming events from every account in the Mac's Calendar app (via CarThingHelper / EventKit).
 * Refreshes on a timer and whenever the helper reports the calendar database changed.
 *
 * `state` is { status: 'ok', events: [{title, location, start, end, allDay, calendar, color}] }
 * or { status: 'denied' | 'notDetermined' | 'restricted' | 'error' | 'loading' }.
 */
export class Calendar extends EventEmitter {
  constructor(helper) {
    super();
    this.helper = helper;
    this.state = { status: 'loading' };
    this.timer = null;
  }

  start() {
    this.refresh();
    setInterval(() => this.refresh(), REFRESH_MS);
    this.helper.on('calendarChanged', () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.refresh(), 1000);
    });
  }

  async refresh() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + DAYS_AHEAD + 1);
    try {
      const r = await this.helper.events(from.getTime(), to.getTime());
      this.#set(r.ok ? { status: 'ok', events: r.events } : { status: r.status || 'error' });
    } catch (err) {
      log.warn('[calendar]', err.message);
      if (this.state.status !== 'ok') this.#set({ status: 'error' });
    }
  }

  #set(state) {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state;
    this.emit('change', state);
  }
}
