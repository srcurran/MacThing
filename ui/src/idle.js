import { watch } from 'vue';
import { state, CT } from './state.js';
import { timerBusy } from './timer.js';

// Settings → When idle: once nothing has played for idleMinutes while Now Playing is up, show
// idleScreen instead: the clock face by default, or the timers, a usage, one of the weather's
// views, or the calendar's month or agenda. Music starting again brings Now Playing back, as long
// as nobody has moved off the screen this put up. Only ever leaves Now Playing, and never over
// Settings, a meeting alert or a timer that's going (unless the timers are what it shows).
const RETRY_MS = 30000; // something was in the way: look again in a bit

var countdown = null;
var autoScreen = ''; // the screen this switched to, until someone navigates

function playing() { return !!(state.np.active && state.np.playing); }

function arm() {
  clearTimeout(countdown);
  countdown = null;
  var minutes = state.settings.idleMinutes;
  if (!minutes || playing() || state.current !== 'nowplaying') return;
  countdown = setTimeout(fire, minutes * 60000);
}

function fire() {
  countdown = null;
  if (playing() || state.current !== 'nowplaying' || !state.settings.idleMinutes) return;
  var target = state.settings.idleScreen || 'clock';
  var busy = (CT.modalOpen && CT.modalOpen()) || (timerBusy.value && target !== 'timer');
  if (busy) { countdown = setTimeout(fire, RETRY_MS); return; }
  showIdleScreen();
}

// Each pick: [screen, the view it opens on].
var TARGETS = {
  clock: ['clock', 'clock'], timer: ['clock', 'timer'], claude: ['clock', 'claude'], chatgpt: ['clock', 'chatgpt'],
  weather: ['weather', 'forecast'], 'weather-today': ['weather', 'today'], 'weather-week': ['weather', 'week'],
  month: ['calendar', 'month'], schedule: ['calendar', 'agenda'], calendar: ['calendar', 'agenda'],
};
function showIdleScreen(fade) {
  var target = TARGETS[state.settings.idleScreen] || TARGETS.clock;
  var screen = CT.screens[target[0]];
  if (!screen) return;
  autoScreen = target[0];
  if (screen.showView) screen.showView(target[1]);
  CT.show(target[0], fade);
}
CT.showIdleScreen = showIdleScreen; // core.js: the page opening with nothing playing

watch(playing, function (on) {
  if (on && autoScreen && state.current === autoScreen) CT.show('nowplaying');
  if (on) autoScreen = '';
  arm();
});
watch(function () { return state.current; }, function (current) {
  if (current !== autoScreen) autoScreen = ''; // someone (or something) else moved the screen
  arm();
});
watch(function () { return state.settings.idleMinutes; }, arm);

// Any input starts the countdown over. A top or settings button on the screen this put up
// (pressing it again, say) counts as choosing it, so music won't take it away again.
CT.on('input', function (key) {
  if (autoScreen && /^[1-4m]$/.test(key)) autoScreen = '';
  arm();
});

arm();
