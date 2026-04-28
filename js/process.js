/* Phasen-Pfeile und Gruppen-Bänder unterhalb des Liniendiagramms. */
(function (PT) {
  'use strict';

  var arrowsEl = null;
  var groupsEl = null;

  PT.initProcess = function () {
    arrowsEl = document.getElementById('phaseArrows');
    groupsEl = document.getElementById('phaseGroups');
  };

  PT.renderProcess = function () {
    if (!arrowsEl || !groupsEl) return;
    var s = PT.state;
    var n = s.phases.length;
    if (n === 0) {
      arrowsEl.innerHTML = '';
      groupsEl.innerHTML = '';
      return;
    }

    arrowsEl.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
    groupsEl.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';

    // Pfeile
    var ah = s.phases.map(function (p, i) {
      var cls = 'phase-arrow' + (i % 2 === 1 ? ' light' : '');
      return '<div class="' + cls + '" title="' + escapeAttr(p.name) + '">' + escapeHtml(p.name) + '</div>';
    }).join('');
    arrowsEl.innerHTML = ah;

    // Gruppenbänder: zusammenhängende Folgen gleicher group bilden je ein Band.
    var bands = [];
    var i = 0;
    while (i < n) {
      var g = s.phases[i].group || '';
      var j = i + 1;
      while (j < n && (s.phases[j].group || '') === g) j++;
      bands.push({ group: g, start: i, end: j - 1, span: j - i });
      i = j;
    }
    var gh = bands.map(function (b, idx) {
      if (!b.group) {
        return '<div style="grid-column: span ' + b.span + '"></div>';
      }
      var cls = 'phase-group-band';
      if (idx === 0) cls += ' first';
      if (idx === bands.length - 1) cls += ' last';
      return '<div class="' + cls + '" style="grid-column: span ' + b.span + '">' +
             escapeHtml(b.group) + '</div>';
    }).join('');
    groupsEl.innerHTML = gh;
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
