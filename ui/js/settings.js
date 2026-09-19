/* Settings (fifth top button) — quick toggles on the device; anything that needs typing opens the
 * settings page on the Mac. Knob turns move the selection, a knob press changes it. */
(function () {
  'use strict';

  var screen = CT.screen('settings');
  var list = CT.$('sList');

  var ROWS = [
    { key: 'theme', label: 'Appearance', options: [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Match Mac']] },
    { key: 'units', label: 'Temperature', options: [['F', '°F'], ['C', '°C']] },
    { key: 'clock24h', label: 'Time format', options: [[false, '12-hour'], [true, '24-hour']] },
    { key: 'clockFace', label: 'Clock face', options: [['analog', 'Analog'], ['numbers', 'Numbers'], ['digital', 'Digital']] },
    {
      label: 'Weather location', page: 'location',
      value: function (s) { return s.location && s.location.mode === 'manual' ? s.location.name : 'Current location'; }
    },
    { label: 'More settings on Mac', page: '', value: function () { return ''; } }
  ];
  var selected = 0;

  function optionIndex(row) {
    for (var i = 0; i < row.options.length; i++) if (row.options[i][0] === CT.settings[row.key]) return i;
    return 0;
  }

  function render() {
    list.innerHTML = ROWS.map(function (row, i) {
      var value = row.value ? row.value(CT.settings) : row.options[optionIndex(row)][1];
      return '<div class="s-row' + (i === selected ? ' sel' : '') + '"><span class="s-label">' + CT.esc(row.label) + '</span>' +
        '<span class="s-value' + (row.page != null ? ' link' : '') + '">' + CT.esc(value) + '</span></div>';
    }).join('');
  }

  screen.turn = function (steps) {
    selected = Math.min(ROWS.length - 1, Math.max(0, selected + steps));
    render();
  };

  screen.press = function () {
    var row = ROWS[selected];
    if (row.page != null) {
      CT.send({ type: 'openSettingsPage', section: row.page });
      CT.toast('Opened on your Mac');
      return;
    }
    var next = row.options[(optionIndex(row) + 1) % row.options.length][0];
    CT.settings[row.key] = next; // optimistic; the Mac echoes the saved settings to every screen
    CT.send({ type: 'setting', key: row.key, value: next });
    CT.applyTheme();
    render();
  };

  screen.show = function () {
    selected = 0;
    render();
  };

  CT.on('settings', render);
})();
