/* Screen 4 · Calendar — the next 7 days from the Mac's Calendar app (bridge/widgets/calendar.js). */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('calendar');
  var el = {
    weekday: $('kWeekday'), day: $('kDay'), month: $('kMonth'), summary: $('kSummary'),
    list: $('kList'), message: $('kMessage')
  };
  var data = { status: 'loading' };

  CT.on('calendar', function (msg) { data = msg.calendar; render(); });
  CT.on('settings', render); // 12/24-hour times
  // Re-render on the minute so finished events drop off and "Now" moves along.
  CT.onSecond(function (now) { if (CT.current === 'calendar' && CT.parts(now).seconds === 0) render(); });

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

  function groupLabel(day, today, ms) {
    if (day === today) return 'Today';
    if (day === today + 1) return 'Tomorrow';
    var p = CT.parts(ms);
    return CT.DAYS[p.day] + ', ' + CT.MONTHS[p.month].slice(0, 3) + ' ' + p.date;
  }

  function render() {
    var now = CT.now();
    var p = CT.parts(now);
    var today = CT.dayNumber(now);
    setText(el.weekday, CT.DAYS[p.day]);
    setText(el.day, String(p.date));
    setText(el.month, CT.MONTHS[p.month]);

    if (data.status !== 'ok') {
      el.list.innerHTML = '';
      setText(el.summary, '');
      if (data.status === 'denied' || data.status === 'restricted' || data.status === 'writeOnly') {
        showMessage('Calendar access is off', 'Allow “Car Thing Helper” in System Settings → Privacy & Security → Calendars.');
      } else if (data.status === 'loading' || data.status === 'notDetermined') {
        showMessage('Loading your calendar…');
      } else {
        showMessage('Calendar unavailable', 'Trying again shortly.');
      }
      return;
    }

    var todays = data.events.filter(function (e) {
      return CT.dayNumber(e.start) <= today && CT.dayNumber(e.end - 1) >= today;
    }).length;
    setText(el.summary, todays === 0 ? 'No events today' : todays === 1 ? '1 event today' : todays + ' events today');

    // Upcoming events grouped by day; multi-day events that started earlier show under Today.
    var upcoming = data.events
      .filter(function (e) { return e.end > now; })
      .map(function (e) { return { e: e, day: Math.max(CT.dayNumber(e.start), today) }; })
      .sort(function (a, b) {
        return a.day - b.day || (b.e.allDay - a.e.allDay) || a.e.start - b.e.start;
      });

    if (!upcoming.length) {
      el.list.innerHTML = '';
      return showMessage('Nothing coming up', 'The next 7 days are clear.');
    }
    showMessage('');

    var rows = [];
    var lastDay = null;
    upcoming.forEach(function (item) {
      var e = item.e;
      if (item.day !== lastDay) {
        rows.push({ header: true, html: '<div class="k-group">' + groupLabel(item.day, today, Math.max(e.start, now)) + '</div>' });
        lastDay = item.day;
      }
      var ongoing = !e.allDay && e.start <= now;
      var where = (e.location || '').split('\n')[0];
      rows.push({
        html: '<div class="k-event' + (ongoing ? ' now' : '') + '">' +
          '<div class="k-bar" style="background:' + CT.esc(e.color) + '"></div>' +
          '<div class="k-time">' + (e.allDay ? 'All day' : ongoing ? 'Now' : CT.esc(CT.timeText(e.start))) + '</div>' +
          '<div class="k-body"><div class="k-title">' + CT.esc(e.title || 'Untitled') + '</div>' +
          (where ? '<div class="k-where">' + CT.esc(where) + '</div>' : '') + '</div></div>'
      });
    });

    // Show as many as fit, then "+N more".
    var shown = rows.length;
    for (;;) {
      var hidden = rows.slice(0, shown).filter(function (r) { return !r.header; }).length;
      hidden = upcoming.length - hidden;
      var visible = rows.slice(0, shown);
      while (visible.length && visible[visible.length - 1].header) visible.pop();
      el.list.innerHTML = visible.map(function (r) { return r.html; }).join('') +
        (hidden > 0 ? '<div class="k-more">+' + hidden + ' more</div>' : '');
      if (el.list.scrollHeight <= el.list.clientHeight || shown <= 1) break;
      shown--;
    }
  }

  screen.show = render;
})();
