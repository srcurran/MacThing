/* Screen 3 · Clock — analog (plain or with numerals) or digital, from the settings. */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('clock');
  var root = screen.el;
  var el = {
    day: $('cDay'), time: $('cTime'), ampm: $('cAmpm'), date: $('cDate'), next: $('cNext'),
    hour: $('cHour'), minute: $('cMinute'), second: $('cSecond'),
    digital: $('cDigital'), digitalSec: $('cDigitalSec')
  };
  var SVG = 'http://www.w3.org/2000/svg';

  function point(r, turns) {
    var a = turns * 2 * Math.PI;
    return { x: 200 + r * Math.sin(a), y: 200 - r * Math.cos(a) };
  }

  (function buildDial() {
    var ticks = $('cTicks');
    for (var i = 0; i < 60; i++) {
      var hour = i % 5 === 0;
      var a = point(hour ? 170 : 181, i / 60);
      var b = point(188, i / 60);
      var line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', a.x.toFixed(2)); line.setAttribute('y1', a.y.toFixed(2));
      line.setAttribute('x2', b.x.toFixed(2)); line.setAttribute('y2', b.y.toFixed(2));
      line.setAttribute('class', hour ? 'c-tick-hour' : 'c-tick-minor');
      ticks.appendChild(line);
    }
    var numerals = $('cNumerals');
    for (var n = 1; n <= 12; n++) {
      var p = point(144, n / 12);
      var text = document.createElementNS(SVG, 'text');
      text.setAttribute('x', p.x.toFixed(2));
      text.setAttribute('y', (p.y + 12).toFixed(2)); // optical centring (no dominant-baseline needed)
      text.setAttribute('text-anchor', 'middle');
      text.textContent = String(n);
      numerals.appendChild(text);
    }
  })();

  function applyFace() {
    var face = CT.settings.clockFace;
    root.classList.toggle('numbers', face === 'numbers');
    root.classList.toggle('digital', face === 'digital');
  }

  function rotate(node, deg) {
    node.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' 200 200)');
  }

  function render(now) {
    var p = CT.parts(now);
    var c = CT.clockText(p);
    var minutes = p.minutes + p.seconds / 60;
    rotate(el.hour, ((p.hours % 12) + minutes / 60) * 30);
    rotate(el.minute, minutes * 6);
    rotate(el.second, p.seconds * 6);

    setText(el.day, CT.DAYS[p.day]);
    setText(el.time, c.time);
    setText(el.ampm, c.ampm);
    setText(el.date, CT.MONTHS[p.month] + ' ' + p.date + ', ' + p.year);
    setText(el.digital, c.time);
    setText(el.digitalSec, (p.seconds < 10 ? '0' : '') + p.seconds);

    var next = CT.nextEvent ? CT.nextEvent(now) : null;
    var nextText = '';
    if (next) {
      var when = CT.dayNumber(next.start) === CT.dayNumber(now) ? CT.timeText(next.start)
        : CT.dayNumber(next.start) === CT.dayNumber(now) + 1 ? 'Tomorrow ' + CT.timeText(next.start)
        : CT.DAYS[CT.parts(next.start).day].slice(0, 3) + ' ' + CT.timeText(next.start);
      nextText = 'Next · <b>' + CT.esc(next.title) + '</b> · ' + CT.esc(when);
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
