/* 3-Ebenen-Prozessbalken:
   1. Top: Sub-Phasen (Analyse..Rollout) - nur über Realisierung
   2. Mitte: Haupt-Phasen (Init, Def, Plan, Realisierung/Steuerung, Abschluss) - fix
   3. Unten: Lifecycle-Gruppen (Vorbereitung, Durchführung, Produktivnahme) - fix
*/
(function (PT) {
  'use strict';

  var topEl = null, midEl = null, botEl = null;

  PT.initProcess = function () {
    topEl = document.getElementById('phaseSubArrows');
    midEl = document.getElementById('phaseMainArrows');
    botEl = document.getElementById('phaseGroups');
  };

  PT.renderProcess = function () {
    if (!topEl || !midEl || !botEl) return;
    var s = PT.state;
    var n = s.phases.length;
    if (n === 0) {
      topEl.innerHTML = midEl.innerHTML = botEl.innerHTML = '';
      return;
    }
    var cols = 'repeat(' + n + ', 1fr)';
    topEl.style.gridTemplateColumns = cols;
    midEl.style.gridTemplateColumns = cols;
    botEl.style.gridTemplateColumns = cols;

    /* Top: Sub-Phasen einzeln, leere Zellen über Main-Phasen */
    var topHtml = s.phases.map(function (p, i) {
      if (p.kind === 'sub') {
        var cls = 'phase-arrow sub' + (i % 2 === 1 ? ' light' : '');
        return '<div class="' + cls + '" title="' + escapeAttr(p.name) + '">' + escapeHtml(p.name) + '</div>';
      }
      return '<div class="phase-arrow-empty" style="grid-column: span 1"></div>';
    }).join('');
    topEl.innerHTML = topHtml;

    /* Mitte: Main-Phasen. Init/Def/Plan/Abschluss je 1 Spalte, Realisierung/Steuerung spannt alle Sub-Spalten. */
    var midSegs = [];
    var i = 0;
    var mainIndex = 0;
    while (i < n) {
      if (s.phases[i].kind === 'main') {
        midSegs.push({ name: s.phases[i].name, span: 1, index: mainIndex });
        i++;
      } else {
        var j = i;
        while (j < n && s.phases[j].kind === 'sub') j++;
        midSegs.push({ name: PT.MAIN_REALISIERUNG, span: j - i, index: mainIndex });
        i = j;
      }
      mainIndex++;
    }
    var midHtml = midSegs.map(function (seg, idx) {
      var cls = 'phase-arrow main' + (idx % 2 === 1 ? ' light' : '');
      if (idx === 0) cls += ' first';
      if (idx === midSegs.length - 1) cls += ' last';
      return '<div class="' + cls + '" style="grid-column: span ' + seg.span + '" title="' +
             escapeAttr(seg.name) + '">' + escapeHtml(seg.name) + '</div>';
    }).join('');
    midEl.innerHTML = midHtml;

    /* Unten: Gruppen-Bänder */
    var bands = [];
    var k = 0;
    while (k < n) {
      var g = s.phases[k].group || '';
      var m = k + 1;
      while (m < n && (s.phases[m].group || '') === g) m++;
      bands.push({ group: g, span: m - k });
      k = m;
    }
    var botHtml = bands.map(function (b, idx) {
      if (!b.group) return '<div style="grid-column: span ' + b.span + '"></div>';
      var cls = 'phase-group-band';
      if (idx === 0) cls += ' first';
      if (idx === bands.length - 1) cls += ' last';
      return '<div class="' + cls + '" style="grid-column: span ' + b.span + '">' +
             escapeHtml(b.group) + '</div>';
    }).join('');
    botEl.innerHTML = botHtml;
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
