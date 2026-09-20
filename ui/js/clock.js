/* Screen 3 · Clock — analog (plain or with numerals) or digital, from the settings. */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('clock');
  var root = screen.el;
  var el = {
    day: $('cDay'), date: $('cDate'), month: $('cMonth'), next: $('cNext'),
    digital: $('cDigital'), digitalSec: $('cDigitalSec')
  };
  // Hour marks only — no dial, minute ticks or second hand (Figma: Widgets / Clock).
  var face = CT.analogFace($('cFace'));

  function applyFace() {
    var face = CT.settings.clockFace;
    root.classList.toggle('numbers', face === 'numbers');
    root.classList.toggle('digital', face === 'digital');
  }

  function render(now) {
    var p = CT.parts(now);
    var c = CT.clockText(p);
    face(now);

    // The face shows the time; the panel shows the date, calendar-style.
    setText(el.day, CT.DAYS[p.day]);
    setText(el.date, String(p.date));
    setText(el.month, CT.MONTHS[p.month]);
    setText(el.digital, c.time);
    setText(el.digitalSec, (p.seconds < 10 ? '0' : '') + p.seconds);

    // Bottom line: the next event still to come today, time first (Figma: Widgets / Clock).
    // Nothing left today means nothing here — tomorrow belongs on the Calendar screen.
    var next = CT.nextEvent ? CT.nextEvent(now) : null;
    var nextText = CT.calendarReady && CT.calendarReady() ? 'No events today' : '';
    if (next && CT.dayNumber(next.start) === CT.dayNumber(now)) {
      nextText = CT.esc(CT.timeText(next.start)) + ' <b>' + CT.esc(next.title) + '</b>';
    }
    if (el.next.innerHTML !== nextText) el.next.innerHTML = nextText;
  }

  CT.onSecond(function (now) { if (CT.current === 'clock') render(now); });
  CT.on('settings', function () { applyFace(); render(CT.now()); });

  screen.show = function () {
    applyFace();
    render(CT.now());
  };
})();
