/* Globaler Namespace + State + localStorage. */
window.PT = window.PT || {};

(function (PT) {
  'use strict';

  PT.STORAGE_KEY = 'phaseTracker.v1';
  PT.GROUPS = ['Vorbereitung', 'Durchführung', 'Produktivnahme'];

  PT.uid = function () {
    return 'id_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };

  PT.defaultState = function () {
    var phases = [
      { id: PT.uid(), name: 'Initialisierung', group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Definition',      group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Planung',         group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Analyse',         group: 'Durchführung' },
      { id: PT.uid(), name: 'Konzeption',      group: 'Durchführung' },
      { id: PT.uid(), name: 'Entwicklung',     group: 'Durchführung' },
      { id: PT.uid(), name: 'Test',            group: 'Durchführung' },
      { id: PT.uid(), name: 'Rollout',         group: 'Produktivnahme' },
      { id: PT.uid(), name: 'Abschluss',       group: 'Produktivnahme' }
    ];
    var lines = [
      { id: PT.uid(), name: 'Projektmanagement', color: '#7BAE3F',
        values: [2, 4, 6, 8, 8, 8, 6, 4, 3] },
      { id: PT.uid(), name: 'Fachliche Arbeit',  color: '#A9C97C',
        values: [1, 3, 8, 15, 20, 18, 10, 4, 2] },
      { id: PT.uid(), name: 'Technische Arbeit', color: '#5C8C2F',
        values: [2, 5, 11, 17, 27, 34, 29, 17, 5] }
    ];
    var roles = [
      { id: PT.uid(), name: 'Projektleitung',  color: '#1F77B4',
        values: [5, 5, 4, 3, 3, 3, 3, 3, 5] },
      { id: PT.uid(), name: 'Stellvertretung', color: '#4A90C2',
        values: [2, 2, 2, 1, 1, 1, 1, 1, 2] },
      { id: PT.uid(), name: 'Projektbüro',     color: '#7AB0D4',
        values: [1, 2, 2, 1, 1, 1, 1, 2, 3] },
      { id: PT.uid(), name: 'techn. Leitung',  color: '#A47C2A',
        values: [1, 2, 4, 6, 8, 10, 8, 5, 2] },
      { id: PT.uid(), name: 'fachl. Leitung',  color: '#C9A66B',
        values: [1, 2, 5, 7, 9, 6, 3, 2, 1] }
    ];
    return {
      phases: phases,
      lines: lines,
      roles: roles,
      totalColor: '#3E6B1F',
      showTotal: true
    };
  };

  PT.state = null;

  PT.load = function () {
    try {
      var raw = localStorage.getItem(PT.STORAGE_KEY);
      if (!raw) { PT.state = PT.defaultState(); return; }
      var parsed = JSON.parse(raw);
      PT.state = PT.normalize(parsed);
    } catch (e) {
      console.warn('State konnte nicht geladen werden, nutze Defaults:', e);
      PT.state = PT.defaultState();
    }
  };

  PT.save = function () {
    try {
      localStorage.setItem(PT.STORAGE_KEY, JSON.stringify(PT.state));
    } catch (e) {
      console.warn('State konnte nicht gespeichert werden:', e);
    }
  };

  PT.reset = function () {
    PT.state = PT.defaultState();
    PT.save();
    PT.notify();
  };

  PT.normalize = function (s) {
    var d = PT.defaultState();
    if (!s || typeof s !== 'object') return d;
    if (!Array.isArray(s.phases) || s.phases.length === 0) return d;
    var n = s.phases.length;
    function fixSeries(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.map(function (item) {
        var v = Array.isArray(item.values) ? item.values.slice(0, n) : [];
        while (v.length < n) v.push(0);
        return {
          id: item.id || PT.uid(),
          name: String(item.name || ''),
          color: String(item.color || '#888888'),
          values: v.map(function (x) { return Number(x) || 0; })
        };
      });
    }
    return {
      phases: s.phases.map(function (p) {
        return {
          id: p.id || PT.uid(),
          name: String(p.name || ''),
          group: PT.GROUPS.indexOf(p.group) >= 0 ? p.group : ''
        };
      }),
      lines: fixSeries(s.lines),
      roles: fixSeries(s.roles),
      totalColor: s.totalColor || '#3E6B1F',
      showTotal: s.showTotal !== false
    };
  };

  /* ===== Pub/Sub für Re-Rendering ===== */
  var subscribers = [];
  PT.subscribe = function (fn) { subscribers.push(fn); };
  PT.notify = function () {
    PT.save();
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](); } catch (e) { console.error(e); }
    }
  };

  /* ===== Mutationen ===== */
  PT.addPhase = function () {
    PT.state.phases.push({ id: PT.uid(), name: 'Neue Phase', group: '' });
    PT.state.lines.forEach(function (l) { l.values.push(0); });
    PT.state.roles.forEach(function (r) { r.values.push(0); });
    PT.notify();
  };

  PT.removePhase = function (idx) {
    if (PT.state.phases.length <= 1) return;
    PT.state.phases.splice(idx, 1);
    PT.state.lines.forEach(function (l) { l.values.splice(idx, 1); });
    PT.state.roles.forEach(function (r) { r.values.splice(idx, 1); });
    PT.notify();
  };

  PT.movePhase = function (idx, delta) {
    var n = PT.state.phases.length;
    var j = idx + delta;
    if (j < 0 || j >= n) return;
    function swap(arr) { var t = arr[idx]; arr[idx] = arr[j]; arr[j] = t; }
    swap(PT.state.phases);
    PT.state.lines.forEach(function (l) { swap(l.values); });
    PT.state.roles.forEach(function (r) { swap(r.values); });
    PT.notify();
  };

  PT.addLine = function () {
    var n = PT.state.phases.length;
    PT.state.lines.push({
      id: PT.uid(), name: 'Neue Linie', color: '#888888',
      values: new Array(n).fill(0)
    });
    PT.notify();
  };

  PT.removeLine = function (idx) {
    PT.state.lines.splice(idx, 1);
    PT.notify();
  };

  PT.addRole = function () {
    var n = PT.state.phases.length;
    PT.state.roles.push({
      id: PT.uid(), name: 'Neue Rolle', color: '#888888',
      values: new Array(n).fill(0)
    });
    PT.notify();
  };

  PT.removeRole = function (idx) {
    PT.state.roles.splice(idx, 1);
    PT.notify();
  };

  /* Set value without immediate rerender of input itself (avoid focus-loss).
     Caller decides whether to call notify(). */
  PT.setLineValue = function (lineIdx, phaseIdx, value) {
    PT.state.lines[lineIdx].values[phaseIdx] = Number(value) || 0;
  };
  PT.setRoleValue = function (roleIdx, phaseIdx, value) {
    PT.state.roles[roleIdx].values[phaseIdx] = Number(value) || 0;
  };

  /* Helpers */
  PT.cumulativePerPhase = function () {
    var n = PT.state.phases.length;
    var out = new Array(n).fill(0);
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < PT.state.lines.length; k++) {
        out[i] += PT.state.lines[k].values[i] || 0;
      }
    }
    return out;
  };

  PT.hexToRgba = function (hex, alpha) {
    var h = (hex || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.substr(0, 2), 16) || 0;
    var g = parseInt(h.substr(2, 2), 16) || 0;
    var b = parseInt(h.substr(4, 2), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };

})(window.PT);
