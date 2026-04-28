/* Heatmap-Leisten: pro Rolle eine horizontale Leiste, Alpha skaliert.
   Zwei Ansichten:
   1. #heatmap        - mit Werten (eingeklappt-/aufklappbar via <details>)
   2. #heatmapSimple  - ohne Werte (separat ausklappbar)
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
    if (rootEl) renderInto(rootEl, /*withValues=*/true, /*editable=*/true);
    if (simpleEl) renderInto(simpleEl, /*withValues=*/false, /*editable=*/false);
  };

  function renderInto(targetEl, withValues, editable) {
    var s = PT.state;
    var n = s.phases.length;
    if (n === 0) { targetEl.innerHTML = ''; return; }

    var html = [];
    var headerCols = '180px repeat(' + n + ', 1fr)';
    html.push('<div class="heatmap-header" style="grid-template-columns:' + headerCols + '">');
    html.push('<div></div>');
    s.phases.forEach(function (p) {
      html.push('<div title="' + escapeAttr(p.name) + '">' + escapeHtml(p.name) + '</div>');
    });
    html.push('</div>');

    s.roles.forEach(function (role, ri) {
      var max = role.values.reduce(function (m, v) { return v > m ? v : m; }, 0);
      html.push('<div class="heatmap-row" style="grid-template-columns:' + headerCols + '" data-role="' + ri + '">');
      if (editable) {
        html.push(
          '<div class="heatmap-label">' +
            '<input type="color" data-act="role-color" data-role="' + ri + '" value="' + escapeAttr(role.color) +
              '" aria-label="Farbe der Rolle ' + escapeAttr(role.name) + '" title="Farbe" />' +
            '<input type="text" data-act="role-name" data-role="' + ri + '" value="' + escapeAttr(role.name) +
              '" aria-label="Rollenname" />' +
            '<button type="button" class="icon-btn" data-act="role-del" data-role="' + ri +
              '" aria-label="Rolle ' + escapeAttr(role.name) + ' löschen" title="löschen">×</button>' +
          '</div>'
        );
      } else {
        html.push('<div class="heatmap-label heatmap-label-static">' + escapeHtml(role.name) + '</div>');
      }
      s.phases.forEach(function (p, pi) {
        var v = Number(role.values[pi]) || 0;
        var alpha = max > 0 ? Math.max(0.05, v / max) : 0;
        var bg = v > 0 ? PT.hexToRgba(role.color, alpha) : 'transparent';
        var textColor = (v > 0) ? PT.contrastTextColor(alpha) : '#6b7785';
        var cls = 'heatmap-cell' + (v > 0 ? '' : ' empty');
        var content;
        if (withValues && editable) {
          content = '<input type="number" min="0" max="' + PT.MAX_VALUE + '" step="1" data-act="role-cell" ' +
            'data-role="' + ri + '" data-phase="' + pi + '" value="' + v + '" ' +
            'aria-label="Tage für ' + escapeAttr(role.name) + ' in ' + escapeAttr(p.name) + '" ' +
            'style="width:100%;border:none;background:transparent;text-align:center;font:inherit;color:' + textColor + ';font-weight:inherit;padding:0;" />';
        } else if (withValues) {
          content = (v > 0 ? v : '');
        } else {
          content = ''; // ohne Werte
        }
        html.push('<div class="' + cls + '" style="background:' + bg + ';color:' + textColor + ';">' + content + '</div>');
      });
      html.push('</div>');
    });

    targetEl.innerHTML = html.join('');
    if (editable) bindEvents(targetEl);
  }

  function bindEvents(targetEl) {
    var debouncedSave = PT.debounce(PT.save, 200);

    targetEl.querySelectorAll('input, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var role = parseInt(el.getAttribute('data-role'), 10);
      var phase = parseInt(el.getAttribute('data-phase'), 10);

      if (el.tagName === 'BUTTON' && act === 'role-del') {
        el.addEventListener('click', function () {
          var hv = PT.state.roles[role].values.some(function (v) { return Number(v) > 0; });
          if (!hv || confirm('Rolle „' + PT.state.roles[role].name + '" löschen? Es sind Werte > 0 hinterlegt.')) {
            PT.removeRole(role);
          }
        });
        return;
      }
      if (act === 'role-color') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          PT.state.roles[role].color = el.value;
          PT.save();
          PT.renderHeatmap();
        });
        return;
      }
      if (act === 'role-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state.roles[role].name = el.value;
          PT.save();
          PT.renderHeatmap();
        });
        return;
      }
      if (act === 'role-cell') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          var clamped = PT.clampValue(el.value);
          if (Number(el.value) !== clamped && el.value !== '') el.value = clamped;
          PT.setRoleValue(role, phase, clamped);
          debouncedSave();
          updateRoleRow(targetEl, role);
          if (typeof PT.updateAllSums === 'function') PT.updateAllSums();
          // Simple-View ebenfalls aktualisieren
          if (simpleEl && simpleEl !== targetEl) {
            updateRoleRow(simpleEl, role, /*withValues=*/false);
          }
        });
        return;
      }
    });
  }

  function updateRoleRow(rootEl, roleIdx, withValuesParam) {
    if (!rootEl) return;
    var withValues = withValuesParam !== false;
    var role = PT.state.roles[roleIdx];
    var max = role.values.reduce(function (m, v) { return v > m ? v : m; }, 0);
    var row = rootEl.querySelector('.heatmap-row[data-role="' + roleIdx + '"]');
    if (!row) return;
    var cells = row.querySelectorAll('.heatmap-cell');
    cells.forEach(function (cell, pi) {
      var v = Number(role.values[pi]) || 0;
      var alpha = max > 0 ? Math.max(0.05, v / max) : 0;
      cell.style.background = v > 0 ? PT.hexToRgba(role.color, alpha) : 'transparent';
      cell.style.color = (v > 0) ? PT.contrastTextColor(alpha) : '#6b7785';
      if (v > 0) cell.classList.remove('empty'); else cell.classList.add('empty');
      // Statische (nicht-editierbare) Zellen: textContent neu setzen
      if (!cell.querySelector('input')) {
        cell.textContent = withValues ? (v > 0 ? v : '') : '';
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
