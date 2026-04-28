/* Heatmap-Leisten: pro Rolle eine horizontale Leiste, Alpha skaliert. */
(function (PT) {
  'use strict';

  var rootEl = null;

  PT.initHeatmap = function () {
    rootEl = document.getElementById('heatmap');
  };

  PT.renderHeatmap = function () {
    if (!rootEl) return;
    var s = PT.state;
    var n = s.phases.length;
    if (n === 0) { rootEl.innerHTML = ''; return; }

    var html = [];
    // Header mit Phasennamen
    var headerCols = '180px repeat(' + n + ', 1fr)';
    html.push('<div class="heatmap-header" style="grid-template-columns:' + headerCols + '">');
    html.push('<div></div>');
    s.phases.forEach(function (p) {
      html.push('<div title="' + escapeAttr(p.name) + '">' + escapeHtml(p.name) + '</div>');
    });
    html.push('</div>');

    // Eine Zeile pro Rolle
    s.roles.forEach(function (role, ri) {
      var max = role.values.reduce(function (m, v) { return v > m ? v : m; }, 0);
      html.push('<div class="heatmap-row" style="grid-template-columns:' + headerCols + '" data-role="' + ri + '">');
      html.push(
        '<div class="heatmap-label">' +
          '<input type="color" data-act="role-color" data-role="' + ri + '" value="' + escapeAttr(role.color) + '" title="Farbe" />' +
          '<input type="text" data-act="role-name" data-role="' + ri + '" value="' + escapeAttr(role.name) + '" />' +
          '<button type="button" class="icon-btn" data-act="role-del" data-role="' + ri + '" title="Rolle löschen">×</button>' +
        '</div>'
      );
      s.phases.forEach(function (p, pi) {
        var v = Number(role.values[pi]) || 0;
        var alpha = max > 0 ? Math.max(0.05, v / max) : 0;
        var bg = v > 0 ? PT.hexToRgba(role.color, alpha) : 'transparent';
        var cls = 'heatmap-cell' + (v > 0 ? '' : ' empty');
        html.push(
          '<div class="' + cls + '" style="background:' + bg + '">' +
            '<input type="number" min="0" step="1" data-act="role-cell" data-role="' + ri + '" data-phase="' + pi + '" value="' + v + '" ' +
              'style="width:100%;border:none;background:transparent;text-align:center;font:inherit;color:inherit;font-weight:inherit;padding:0;" />' +
          '</div>'
        );
      });
      html.push('</div>');
    });

    rootEl.innerHTML = html.join('');
    bindEvents();
  };

  function bindEvents() {
    rootEl.querySelectorAll('input, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var role = parseInt(el.getAttribute('data-role'), 10);
      var phase = parseInt(el.getAttribute('data-phase'), 10);

      if (el.tagName === 'BUTTON' && act === 'role-del') {
        el.addEventListener('click', function () { PT.removeRole(role); });
        return;
      }
      if (act === 'role-color') {
        el.addEventListener('input', function () {
          PT.state.roles[role].color = el.value;
          PT.save();
          PT.renderHeatmap();
        });
        return;
      }
      if (act === 'role-name') {
        el.addEventListener('change', function () {
          PT.state.roles[role].name = el.value;
          PT.save();
        });
        return;
      }
      if (act === 'role-cell') {
        el.addEventListener('input', function () {
          PT.setRoleValue(role, phase, el.value);
          PT.save();
          // Nur Heatmap-Zellen aktualisieren, ohne Re-Render mit Focus-Verlust:
          updateRoleRow(role);
        });
        return;
      }
    });
  }

  function updateRoleRow(roleIdx) {
    var role = PT.state.roles[roleIdx];
    var max = role.values.reduce(function (m, v) { return v > m ? v : m; }, 0);
    var row = rootEl.querySelector('.heatmap-row[data-role="' + roleIdx + '"]');
    if (!row) return;
    var cells = row.querySelectorAll('.heatmap-cell');
    cells.forEach(function (cell, pi) {
      var v = Number(role.values[pi]) || 0;
      var alpha = max > 0 ? Math.max(0.05, v / max) : 0;
      cell.style.background = v > 0 ? PT.hexToRgba(role.color, alpha) : 'transparent';
      if (v > 0) cell.classList.remove('empty'); else cell.classList.add('empty');
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
