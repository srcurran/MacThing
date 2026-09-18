/* Screen 2 · Weather — Open-Meteo data prepared by the bridge (bridge/widgets/weather.js). */
(function () {
  'use strict';

  var $ = CT.$;
  var setText = CT.setText;
  var screen = CT.screen('weather');
  var root = screen.el;
  var el = {
    place: $('wPlace'), temp: $('wTemp'), cond: $('wCond'), condIcon: $('wCondIcon'), sub: $('wSub'),
    updated: $('wUpdated'), hourly: $('wHourly'), daily: $('wDaily'), message: $('wMessage')
  };
  var data = { status: 'loading' };

  // WMO weather codes → [kind, label, daytime label]
  var CODES = {
    0: ['clear', 'Clear', 'Sunny'], 1: ['partly', 'Mostly clear', 'Mostly sunny'], 2: ['partly', 'Partly cloudy'],
    3: ['cloudy', 'Cloudy'], 45: ['fog', 'Fog'], 48: ['fog', 'Freezing fog'],
    51: ['drizzle', 'Light drizzle'], 53: ['drizzle', 'Drizzle'], 55: ['drizzle', 'Heavy drizzle'],
    56: ['drizzle', 'Freezing drizzle'], 57: ['drizzle', 'Freezing drizzle'],
    61: ['rain', 'Light rain'], 63: ['rain', 'Rain'], 65: ['rain', 'Heavy rain'], 66: ['rain', 'Freezing rain'], 67: ['rain', 'Freezing rain'],
    71: ['snow', 'Light snow'], 73: ['snow', 'Snow'], 75: ['snow', 'Heavy snow'], 77: ['snow', 'Snow grains'],
    80: ['rain', 'Showers'], 81: ['rain', 'Showers'], 82: ['rain', 'Heavy showers'], 85: ['snow', 'Snow showers'], 86: ['snow', 'Snow showers'],
    95: ['thunder', 'Thunderstorms'], 96: ['thunder', 'Thunderstorms'], 99: ['thunder', 'Thunderstorms']
  };
  function describe(code, isDay) {
    var c = CODES[code] || ['cloudy', 'Cloudy'];
    var kind = c[0];
    var dayNight = kind === 'clear' || kind === 'partly' ? kind + '-' + (isDay ? 'day' : 'night') : null;
    return { icon: '#w-' + (dayNight || kind), label: (isDay && c[2]) || c[1] };
  }

  function icon(code, isDay) {
    return '<svg><use href="' + describe(code, isDay).icon + '"></use></svg>';
  }

  CT.on('weather', function (msg) { data = msg.weather; render(); });
  CT.on('settings', render); // 12/24-hour labels

  function showMessage(title, detail) {
    el.message.innerHTML = title ? CT.esc(title) + (detail ? '<small>' + CT.esc(detail) + '</small>' : '') : '';
    el.message.classList.toggle('on', !!title);
  }

  function render() {
    var ok = data.status === 'ok';
    root.classList.toggle('w-empty', !ok);
    if (!ok) {
      setText(el.place, 'Weather');
      setText(el.temp, '--°');
      setText(el.cond, '');
      el.condIcon.setAttribute('href', '');
      setText(el.sub, '');
      setText(el.updated, '');
      if (data.status === 'noLocation') {
        showMessage(
          data.reason === 'denied' || data.reason === 'restricted' ? 'Location access is off' : 'Can’t find your location',
          'Press the back button and choose Weather location to pick a place.'
        );
      } else if (data.status === 'error') {
        showMessage('Weather unavailable', 'Trying again shortly.');
      } else {
        showMessage('Getting the weather…');
      }
      return;
    }
    showMessage('');

    var tz = data.utcOffset / 60; // the forecast place's timezone
    var now = describe(data.current.code, data.current.isDay);
    setText(el.place, data.place);
    setText(el.temp, data.current.temp + '°');
    el.condIcon.setAttribute('href', now.icon);
    setText(el.cond, now.label);
    setText(el.sub, 'Feels like ' + data.current.feels + '°\nH ' + data.today.hi + '°  L ' + data.today.lo + '°');
    setText(el.updated, 'Updated ' + CT.timeText(data.updatedAt));

    el.hourly.innerHTML = data.hourly.map(function (h, i) {
      if (i === 0) h = { temp: data.current.temp, code: data.current.code, isDay: data.current.isDay, pop: h.pop }; // "Now" matches the big number
      return '<div class="w-hour"><div class="w-hour-t">' + (i === 0 ? 'Now' : CT.hourText(h.t, tz)) + '</div>' +
        icon(h.code, h.isDay) +
        '<div class="w-hour-temp">' + h.temp + '°</div>' +
        '<div class="w-pop">' + (h.pop >= 20 ? h.pop + '%' : '') + '</div></div>';
    }).join('');

    var days = data.daily.slice(0, 5);
    var min = Math.min.apply(null, days.map(function (d) { return d.lo; }));
    var max = Math.max.apply(null, days.map(function (d) { return d.hi; }));
    var span = Math.max(1, max - min);
    el.daily.innerHTML = days.map(function (d, i) {
      var left = ((d.lo - min) / span) * 100;
      var right = ((max - d.hi) / span) * 100;
      return '<div class="w-day"><div class="w-day-name">' + (i === 0 ? 'Today' : CT.DAYS[CT.parts(d.t, tz).day].slice(0, 3)) + '</div>' +
        icon(d.code, true) +
        '<div class="w-pop">' + (d.pop >= 20 ? d.pop + '%' : '') + '</div>' +
        '<div class="w-lo">' + d.lo + '°</div>' +
        '<div class="w-range"><i style="left:' + left.toFixed(1) + '%;right:' + right.toFixed(1) + '%"></i></div>' +
        '<div class="w-hi">' + d.hi + '°</div></div>';
    }).join('');
  }

  screen.show = render;
})();
