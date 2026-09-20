/* Screen 4 · Calendar — what's left of today, then tomorrow, from the Mac's Calendar app
   (bridge/widgets/calendar.js). */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('calendar');
  var el = { weekday: $('kWeekday'), clock: $('kClock'), list: $('kList'), message: $('kMessage') };
  var data = { status: 'loading' };

  CT.on('calendar', function (msg) { data = msg.calendar; render(); });
  CT.on('settings', render); // 12/24-hour times
  // Re-render on the minute so finished events drop off and "Now" moves along.
  CT.onSecond(function (now) { if (CT.current === 'calendar' && CT.parts(now).seconds === 0) render(); });

  /** True once the Mac has sent real events — the Clock screen waits for this before saying there are none. */
  CT.calendarReady = function () { return data.status === 'ok'; };

  /** Next timed event that hasn't started yet — also used by the Clock screen. */
  CT.nextEvent = function (now) {
    if (data.status !== 'ok') return null;
    for (var i = 0; i < data.events.length; i++) {
      var e = data.events[i];
      if (!e.allDay && e.start > now) return e;
    }
    return null;
  };

  function showMessage(title, detail) {
    el.message.innerHTML = title ? CT.esc(title) + (detail ? '<small>' + CT.esc(detail) + '</small>' : '') : '';
    el.message.classList.toggle('on', !!title);
  }

  // Big clock at the weather-temperature size (no AM/PM); steps down only if it wouldn't fit.
  function renderClock(p) {
    var time = CT.clockText(p).time;
    if (el.clock.textContent === time) return;
    setText(el.clock, time);
    el.clock.style.fontSize = '';
    for (var size = 112; el.clock.scrollWidth > el.clock.clientWidth && size > 72; ) {
      size -= 8;
      el.clock.style.fontSize = size + 'px';
    }
  }

  function render() {
    var now = CT.now();
    var p = CT.parts(now);
    var today = CT.dayNumber(now);
    setText(el.weekday, CT.DAYS[p.day] + ' ' + (p.month + 1) + '/' + p.date); // "Friday 9/18"
    renderClock(p);

    if (data.status !== 'ok') {
      el.list.innerHTML = '';
      if (data.status === 'denied' || data.status === 'restricted' || data.status === 'writeOnly') {
        showMessage('Calendar access is off', 'Allow “Car Thing Helper” in System Settings → Privacy & Security → Calendars.');
      } else if (data.status === 'loading' || data.status === 'notDetermined') {
        showMessage('Loading your calendar…');
      } else {
        showMessage('Calendar unavailable', 'Trying again shortly.');
      }
      return;
    }

    var days = CT.settings.calendarDays || 2; // today plus the next (days − 1), from the Mac settings page

    // One section per day. Within a day: all-day first, then by start time. An event that runs
    // past midnight stays under the day it started, so it's only listed once.
    function byDay(keep) {
      return data.events.filter(keep).sort(function (a, b) { return (b.allDay - a.allDay) || a.start - b.start; });
    }
    var sections = [{ label: '', events: byDay(function (e) { return e.end > now && CT.dayNumber(e.start) <= today; }) }];
    for (var i = 1; i < days; i++) {
      sections.push({
        label: i === 1 ? 'Tomorrow' : CT.DAYS[CT.parts(now + i * 86400000).day],
        events: byDay((function (day) {
          return function (e) { return CT.dayNumber(e.start) === day; };
        })(today + i))
      });
    }
    sections = sections.filter(function (s) { return s.events.length; });

    if (!sections.length) {
      el.list.innerHTML = '';
      return showMessage('Nothing scheduled', days > 1 ? 'The next ' + days + ' days are clear.' : 'The rest of the day is clear.');
    }
    showMessage('');

    function eventRow(e) {
      var ongoing = !e.allDay && e.start <= now;
      var where = (e.location || '').split('\n')[0];
      return '<div class="k-event' + (ongoing ? ' now' : '') + '">' +
        '<div class="k-bar" style="background:' + CT.esc(e.color) + '"></div>' +
        '<div class="k-body"><div class="k-line">' +
        '<span class="k-time">' + (e.allDay ? 'All day' : ongoing ? 'NOW' : CT.esc(CT.timeText(e.start))) + '</span>' +
        '<span class="k-title">' + CT.esc(e.title || 'Untitled') + '</span></div>' +
        (where ? '<div class="k-where">' + CT.esc(where) + '</div>' : '') + '</div></div>';
    }

    function draw(kept) {
      el.list.innerHTML = kept.map(function (s) {
        var hidden = s.events.length - s.shown;
        return (s.label ? '<div class="k-day">' + CT.esc(s.label) + '</div>' : '') +
          s.events.slice(0, s.shown).map(eventRow).join('') +
          (hidden > 0 ? '<div class="k-more">+' + hidden + ' more</div>' : '');
      }).join('');
      return el.list.scrollHeight <= el.list.clientHeight;
    }

    // Fit the days on screen: trim whichever day shows the most (latest day first on a tie), so
    // every day keeps a row for as long as possible. Days that still don't fit drop off the end.
    var kept = sections.map(function (s) { return { label: s.label, events: s.events, shown: s.events.length }; });
    while (!draw(kept)) {
      var fattest = -1;
      for (var k = 0; k < kept.length; k++) {
        if (kept[k].shown > 1 && (fattest < 0 || kept[k].shown >= kept[fattest].shown)) fattest = k;
      }
      if (fattest >= 0) kept[fattest].shown--;
      else if (kept.length > 1) kept.pop();
      else break;
    }
  }

  screen.show = render;
})();
