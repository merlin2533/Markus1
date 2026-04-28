/* Globaler Namespace + State + localStorage.

   Datenmodell:
   - state.phases: flache Liste mit fixen Haupt-Phasen (kind='main', fixed=true)
     und benutzerdefinierten Sub-Phasen (kind='sub') in der Mitte.
   - state.lines: Aufwands-Kategorien (z.B. Projektmanagement, Fachliche Arbeit,
     Technische Arbeit) mit values[phaseIdx] = Tage.
   - state.roles: Rollen (Projektleitung, ...) mit percentages[lineIdx] = 0..100.
     Die tatsächlichen Tage pro Rolle und Phase werden berechnet:
       roleDays(r, p) = sum_l(lines[l].values[p] * roles[r].percentages[l] / 100)
*/
window.PT = window.PT || {};

(function (PT) {
  'use strict';

  PT.STORAGE_KEY = 'phaseTracker.v3';
  PT.GROUPS = ['Vorbereitung', 'Durchführung', 'Produktivnahme'];
  PT.MAIN_REALISIERUNG = 'Realisierung / Steuerung';

  PT.uid = function () {
    return 'id_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };

  PT.defaultState = function () {
    var phases = [
      { id: PT.uid(), name: 'Initialisierung', kind: 'main', fixed: true, group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Definition',      kind: 'main', fixed: true, group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Planung',         kind: 'main', fixed: true, group: 'Vorbereitung' },
      { id: PT.uid(), name: 'Analyse',         kind: 'sub',  fixed: false, group: 'Durchführung' },
      { id: PT.uid(), name: 'Konzeption',      kind: 'sub',  fixed: false, group: 'Durchführung' },
      { id: PT.uid(), name: 'Entwicklung',     kind: 'sub',  fixed: false, group: 'Durchführung' },
      { id: PT.uid(), name: 'Test',            kind: 'sub',  fixed: false, group: 'Durchführung' },
      { id: PT.uid(), name: 'Rollout',         kind: 'sub',  fixed: false, group: 'Durchführung' },
      { id: PT.uid(), name: 'Abschluss',       kind: 'main', fixed: true, group: 'Produktivnahme' }
    ];
    var lines = [
      { id: PT.uid(), name: 'Projektmanagement', color: '#7BAE3F',
        values: [2, 4, 6, 8, 8, 8, 6, 4, 3] },
      { id: PT.uid(), name: 'Fachliche Arbeit',  color: '#A9C97C',
        values: [1, 3, 8, 15, 20, 18, 10, 4, 2] },
      { id: PT.uid(), name: 'Technische Arbeit', color: '#5C8C2F',
        values: [2, 5, 11, 17, 27, 34, 29, 17, 5] }
    ];
    // percentages[lineIdx] - Spalten-Summe sollte ~100% sein.
    var roles = [
      { id: PT.uid(), name: 'Projektleitung',  color: '#1F77B4', percentages: [40, 10, 10] },
      { id: PT.uid(), name: 'Stellvertretung', color: '#4A90C2', percentages: [20,  5,  5] },
      { id: PT.uid(), name: 'Projektbüro',     color: '#7AB0D4', percentages: [20,  5,  5] },
      { id: PT.uid(), name: 'techn. Leitung',  color: '#A47C2A', percentages: [10, 10, 70] },
      { id: PT.uid(), name: 'fachl. Leitung',  color: '#C9A66B', percentages: [10, 70, 10] }
    ];
    return {
      phases: phases,
      lines: lines,
      roles: roles,
      totalColor: '#3E6B1F',
      showTotal: true,
      showZusatz: false,
      showNormal: true,
      showLabels: false
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
    PT.pushHistory();
    PT.state = PT.defaultState();
    PT.save();
    PT.notify();
  };

  /* ===== Normalize ===== */
  PT.normalize = function (s) {
    var d = PT.defaultState();
    if (!s || typeof s !== 'object' || !Array.isArray(s.phases) || s.phases.length === 0) {
      return d;
    }
    var src = s.phases.slice();
    var phases = [];
    function makeMain(name, group, fallback) {
      return { id: PT.uid(), name: String(name || fallback), kind: 'main', fixed: true, group: group };
    }
    function makeSub(p) {
      return { id: p.id || PT.uid(), name: String(p.name || 'Sub-Phase'),
               kind: 'sub', fixed: false, group: 'Durchführung' };
    }
    if (src.length >= 4) {
      phases.push(makeMain(src[0].name, 'Vorbereitung', 'Initialisierung'));
      phases.push(makeMain(src[1].name, 'Vorbereitung', 'Definition'));
      phases.push(makeMain(src[2].name, 'Vorbereitung', 'Planung'));
      for (var i = 3; i < src.length - 1; i++) phases.push(makeSub(src[i]));
      phases.push(makeMain(src[src.length - 1].name, 'Produktivnahme', 'Abschluss'));
    } else {
      return d;
    }

    var n = phases.length;
    function fixLines(arr) {
      if (!Array.isArray(arr)) return d.lines;
      return arr.map(function (item) {
        var v = Array.isArray(item.values) ? item.values.slice(0, n) : [];
        while (v.length < n) v.push(0);
        return {
          id: item.id || PT.uid(),
          name: String(item.name || ''),
          color: String(item.color || '#888888'),
          values: v.map(function (x) { return PT.clampValue(x); })
        };
      });
    }
    var lines = fixLines(s.lines);
    var L = lines.length;
    function fixRoles(arr) {
      if (!Array.isArray(arr)) return d.roles.slice(0, 0);
      return arr.map(function (item) {
        var p = Array.isArray(item.percentages) ? item.percentages.slice(0, L) : [];
        while (p.length < L) p.push(0);
        return {
          id: item.id || PT.uid(),
          name: String(item.name || ''),
          color: String(item.color || '#888888'),
          percentages: p.map(function (x) { return PT.clampPercent(x); })
        };
      });
    }
    return {
      phases: phases,
      lines: lines,
      roles: fixRoles(s.roles),
      totalColor: s.totalColor || '#3E6B1F',
      showTotal: s.showTotal !== false,
      showZusatz: !!s.showZusatz,
      showNormal: s.showNormal !== false,
      showLabels: !!s.showLabels
    };
  };

  /* ===== Pub/Sub ===== */
  var subscribers = [];
  PT.subscribe = function (fn) { subscribers.push(fn); };
  PT.notify = function () {
    PT.save();
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](); } catch (e) { console.error(e); }
    }
  };

  /* ===== Sanity-Grenzen ===== */
  PT.MAX_VALUE = 9999;
  PT.clampValue = function (v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    if (n > PT.MAX_VALUE) return PT.MAX_VALUE;
    return n;
  };
  PT.clampPercent = function (v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    if (n > 100) return 100;
    return n;
  };

  /* ===== Debounce ===== */
  PT.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(ctx, args); }, wait);
    };
  };

  /* ===== History ===== */
  PT.history = { undo: [], redo: [], max: 50 };
  PT.pushHistory = function () {
    var snap = JSON.stringify(PT.state);
    var top = PT.history.undo[PT.history.undo.length - 1];
    if (top === snap) return;
    PT.history.undo.push(snap);
    if (PT.history.undo.length > PT.history.max) PT.history.undo.shift();
    PT.history.redo.length = 0;
  };
  PT.canUndo = function () { return PT.history.undo.length > 0; };
  PT.canRedo = function () { return PT.history.redo.length > 0; };
  PT.undo = function () {
    if (!PT.canUndo()) return;
    PT.history.redo.push(JSON.stringify(PT.state));
    PT.state = JSON.parse(PT.history.undo.pop());
    PT.notify();
  };
  PT.redo = function () {
    if (!PT.canRedo()) return;
    PT.history.undo.push(JSON.stringify(PT.state));
    PT.state = JSON.parse(PT.history.redo.pop());
    PT.notify();
  };

  /* ===== Phasen-Mutationen ===== */
  PT.subPhaseRange = function () {
    var phases = PT.state.phases;
    var start = -1, end = -1;
    for (var i = 0; i < phases.length; i++) {
      if (phases[i].kind === 'sub') {
        if (start < 0) start = i;
        end = i;
      }
    }
    return { start: start, end: end };
  };

  PT.addSubPhase = function () {
    PT.pushHistory();
    var range = PT.subPhaseRange();
    var insertAt = (range.end >= 0 ? range.end + 1 : PT.state.phases.length - 1);
    var newPhase = {
      id: PT.uid(), name: 'Neue Sub-Phase', kind: 'sub', fixed: false, group: 'Durchführung'
    };
    PT.state.phases.splice(insertAt, 0, newPhase);
    PT.state.lines.forEach(function (l) { l.values.splice(insertAt, 0, 0); });
    PT.notify();
  };
  PT.addPhase = PT.addSubPhase;

  PT.removePhase = function (idx) {
    var phase = PT.state.phases[idx];
    if (!phase || phase.fixed) return;
    var range = PT.subPhaseRange();
    if (range.start === range.end) return;
    PT.pushHistory();
    PT.state.phases.splice(idx, 1);
    PT.state.lines.forEach(function (l) { l.values.splice(idx, 1); });
    PT.notify();
  };

  PT.movePhase = function (idx, delta) {
    var phase = PT.state.phases[idx];
    if (!phase || phase.fixed) return;
    var j = idx + delta;
    var target = PT.state.phases[j];
    if (!target || target.fixed) return;
    PT.pushHistory();
    function swap(arr) { var t = arr[idx]; arr[idx] = arr[j]; arr[j] = t; }
    swap(PT.state.phases);
    PT.state.lines.forEach(function (l) { swap(l.values); });
    PT.notify();
  };

  PT.movePhaseTo = function (from, to) {
    var pf = PT.state.phases[from];
    var pt = PT.state.phases[to];
    if (!pf || !pt || pf.fixed || pt.fixed) return;
    if (from === to) return;
    PT.pushHistory();
    function moveItem(arr) {
      var item = arr.splice(from, 1)[0];
      arr.splice(to, 0, item);
    }
    moveItem(PT.state.phases);
    PT.state.lines.forEach(function (l) { moveItem(l.values); });
    PT.notify();
  };

  /* ===== Linien-Mutationen ===== */
  PT.addLine = function () {
    PT.pushHistory();
    var n = PT.state.phases.length;
    PT.state.lines.push({
      id: PT.uid(), name: 'Neue Linie', color: '#888888',
      values: new Array(n).fill(0)
    });
    // Allen Rollen einen 0%-Eintrag für die neue Linie hinzufügen.
    PT.state.roles.forEach(function (r) { r.percentages.push(0); });
    PT.notify();
  };

  PT.removeLine = function (idx) {
    PT.pushHistory();
    PT.state.lines.splice(idx, 1);
    PT.state.roles.forEach(function (r) { r.percentages.splice(idx, 1); });
    PT.notify();
  };

  PT.moveLineTo = function (from, to) {
    var n = PT.state.lines.length;
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
    PT.pushHistory();
    var item = PT.state.lines.splice(from, 1)[0];
    PT.state.lines.splice(to, 0, item);
    // Auch die Rollen-Prozentwerte umsortieren.
    PT.state.roles.forEach(function (r) {
      var p = r.percentages.splice(from, 1)[0];
      r.percentages.splice(to, 0, p);
    });
    PT.notify();
  };

  /* ===== Rollen-Mutationen ===== */
  PT.addRole = function () {
    PT.pushHistory();
    var L = PT.state.lines.length;
    PT.state.roles.push({
      id: PT.uid(), name: 'Neue Rolle', color: '#888888',
      percentages: new Array(L).fill(0)
    });
    PT.notify();
  };

  PT.removeRole = function (idx) {
    PT.pushHistory();
    PT.state.roles.splice(idx, 1);
    PT.notify();
  };

  PT.moveRoleTo = function (from, to) {
    var n = PT.state.roles.length;
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
    PT.pushHistory();
    var item = PT.state.roles.splice(from, 1)[0];
    PT.state.roles.splice(to, 0, item);
    PT.notify();
  };

  /* ===== Setter ===== */
  PT.setLineValue = function (lineIdx, phaseIdx, value) {
    PT.state.lines[lineIdx].values[phaseIdx] = PT.clampValue(value);
  };
  PT.setRolePercent = function (roleIdx, lineIdx, value) {
    PT.state.roles[roleIdx].percentages[lineIdx] = PT.clampPercent(value);
  };

  /* ===== Berechnung ===== */
  // Rollen-Tage in einer bestimmten Phase = sum_l(line[l].values[p] * pct[l] / 100)
  PT.roleDayInPhase = function (roleIdx, phaseIdx) {
    var role = PT.state.roles[roleIdx];
    if (!role) return 0;
    var sum = 0;
    for (var l = 0; l < PT.state.lines.length; l++) {
      sum += (Number(PT.state.lines[l].values[phaseIdx]) || 0) *
             (Number(role.percentages[l]) || 0) / 100;
    }
    return sum;
  };
  PT.roleDaysAll = function (roleIdx) {
    var n = PT.state.phases.length;
    var out = new Array(n);
    for (var p = 0; p < n; p++) out[p] = PT.roleDayInPhase(roleIdx, p);
    return out;
  };
  PT.roleSumDays = function (roleIdx) {
    var sum = 0;
    var n = PT.state.phases.length;
    for (var p = 0; p < n; p++) sum += PT.roleDayInPhase(roleIdx, p);
    return sum;
  };

  // Cumulative der Linien (Normalaufwand-Gesamt)
  PT.cumulativePerPhase = function () {
    var n = PT.state.phases.length;
    var out = new Array(n).fill(0);
    for (var i = 0; i < n; i++) {
      for (var k = 0; k < PT.state.lines.length; k++) {
        out[i] += Number(PT.state.lines[k].values[i]) || 0;
      }
    }
    return out;
  };

  /* ===== Helper ===== */
  PT.hexToRgba = function (hex, alpha) {
    var h = (hex || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.substr(0, 2), 16) || 0;
    var g = parseInt(h.substr(2, 2), 16) || 0;
    var b = parseInt(h.substr(4, 2), 16) || 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  };
  PT.contrastTextColor = function (alpha) {
    return alpha > 0.55 ? '#ffffff' : '#1f2933';
  };

})(window.PT);
