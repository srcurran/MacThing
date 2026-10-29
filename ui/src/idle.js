import { watch } from 'vue';
import { state, CT } from './state.js';
import { timerBusy } from './timer.js';

// Settings → When idle: once nothing has played for idleMinutes while Now Playing is up, show
// idleScreen instead (the clock face, by default; also the timers, a usage, the weather or the
// calendar). Music starting again brings Now Playing back, as long as nobody has moved off the
// screen this put up. Only ever leaves Now Playing, and never over Settings, a meeting alert or a
// timer that's going (unless the timers are what it shows).
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

// The clock's views (its face, the timers, a usage) are all the clock screen.
var CLOCK_VIEWS = ['clock', 'timer', 'claude', 'chatgpt'];
function showIdleScreen(fade) {
  var target = state.settings.idleScreen || 'clock';
  var screen = CLOCK_VIEWS.includes(target) ? 'clock' : target;
  if (!CT.screens[screen]) return;
  autoScreen = screen;
  if (screen === 'clock' && CT.showClockView) CT.showClockView(target, fade);
  else CT.show(screen, fade);
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
