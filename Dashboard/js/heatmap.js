/* Heatmap-Leisten: pro Rolle eine horizontale Leiste, Werte sind aus
   den Linien × Prozenten BERECHNET (nicht direkt editierbar).
   Zwei Ansichten:
   1. #heatmap        - mit Werten
   2. #heatmapSimple  - ohne Werte
*/
(function (PT) {
  'use strict';

  var rootEl = null;
  var simpleEl = null;

  PT.initHeatmap = function () {
    rootEl = document.getElementById('heatmap');
    simpleEl = document.getElementById('heatmapSimple');
  };

  PT.renderHeatmap = function () {
    if (rootEl) renderInto(rootEl, /*withValues=*/true);
    if (simpleEl) renderInto(simpleEl, /*withValues=*/false);
  };

  function renderInto(targetEl, withValues) {
    var s = PT.state;
    var n = s.phases.length;
    if (n === 0) { targetEl.innerHTML = ''; return; }

    var html = [];
    var cols = '180px repeat(' + n + ', 1fr)';
    html.push('<div class="heatmap-header" style="grid-template-columns:' + cols + '">');
    html.push('<div></div>');
    s.phases.forEach(function (p) {
      html.push('<div title="' + esc(p.name) + '">' + esc(p.name) + '</div>');
    });
    html.push('</div>');

    s.roles.forEach(function (role, ri) {
      var days = PT.roleDaysAll(ri);
      var max = days.reduce(function (m, v) { return v > m ? v : m; }, 0);
      html.push('<div class="heatmap-row" style="grid-template-columns:' + cols + '" data-role="' + ri + '">');
      html.push('<div class="heatmap-label heatmap-label-static">' + esc(role.name) + '</div>');
      days.forEach(function (v) {
        var alpha = max > 0 ? Math.max(0.05, v / max) : 0;
        var bg = v > 0 ? PT.hexToRgba(role.color, alpha) : 'transparent';
        var textColor = (v > 0) ? PT.contrastTextColor(alpha) : '#6b7785';
        var cls = 'heatmap-cell' + (v > 0 ? '' : ' empty');
        var content = (withValues && v > 0) ? (Math.round(v * 10) / 10) : '';
        html.push('<div class="' + cls + '" style="background:' + bg + ';color:' + textColor + ';">' + content + '</div>');
      });
      html.push('</div>');
    });

    targetEl.innerHTML = html.join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})(window.PT);
