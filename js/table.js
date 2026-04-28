/* Tabellen-Renderer: Zeilen = Phasen, Spalten = Linien. */
(function (PT) {
  'use strict';

  var tableEl = null;

  PT.initTable = function () {
    tableEl = document.getElementById('dataTable');
  };

  PT.renderTable = function () {
    if (!tableEl) return;
    var s = PT.state;
    var html = [];

    // Header: Phase | Linien... | Summe | Aktionen
    html.push('<thead>');
    html.push('<tr>');
    html.push('<th class="phase-col">Phase / Gruppe</th>');
    s.lines.forEach(function (line, li) {
      html.push(
        '<th class="line-header" data-line="' + li + '">' +
          '<div class="line-head-row">' +
            '<input type="color" data-act="line-color" data-line="' + li + '" value="' + escapeAttr(line.color) + '" title="Farbe" />' +
            '<input type="text" data-act="line-name" data-line="' + li + '" value="' + escapeAttr(line.name) + '" />' +
            '<button type="button" class="icon-btn" data-act="line-del" data-line="' + li + '" title="Linie löschen">×</button>' +
          '</div>' +
        '</th>'
      );
    });
    html.push('<th class="sum-col">Summe</th>');
    html.push('<th class="row-actions"></th>');
    html.push('</tr>');
    html.push('</thead>');

    // Body
    html.push('<tbody>');
    s.phases.forEach(function (phase, pi) {
      var rowSum = 0;
      html.push('<tr data-phase="' + pi + '">');
      // Phase name + group
      var groupOpts = ['<option value="">– keine –</option>'].concat(
        PT.GROUPS.map(function (g) {
          var sel = g === phase.group ? ' selected' : '';
          return '<option value="' + escapeAttr(g) + '"' + sel + '>' + escapeHtml(g) + '</option>';
        })
      ).join('');
      html.push(
        '<td class="phase-col">' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
            '<button type="button" class="icon-btn move" data-act="phase-up" data-phase="' + pi + '" title="Hoch">▲</button>' +
            '<button type="button" class="icon-btn move" data-act="phase-down" data-phase="' + pi + '" title="Runter">▼</button>' +
            '<input type="text" data-act="phase-name" data-phase="' + pi + '" value="' + escapeAttr(phase.name) + '" />' +
            '<select class="group-select" data-act="phase-group" data-phase="' + pi + '">' + groupOpts + '</select>' +
          '</div>' +
        '</td>'
      );
      s.lines.forEach(function (line, li) {
        var v = line.values[pi] || 0;
        rowSum += v;
        html.push(
          '<td>' +
            '<input type="number" min="0" step="1" data-act="cell" data-line="' + li + '" data-phase="' + pi + '" value="' + v + '" />' +
          '</td>'
        );
      });
      html.push('<td class="sum-col">' + rowSum + '</td>');
      html.push(
        '<td class="row-actions">' +
          '<button type="button" class="icon-btn" data-act="phase-del" data-phase="' + pi + '" title="Phase löschen">×</button>' +
        '</td>'
      );
      html.push('</tr>');
    });

    // Spaltensumme
    html.push('<tr>');
    html.push('<td class="phase-col" style="font-weight:700;">Σ pro Linie</td>');
    s.lines.forEach(function (line) {
      var sum = line.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      html.push('<td class="sum-col">' + sum + '</td>');
    });
    var grand = s.lines.reduce(function (a, l) {
      return a + l.values.reduce(function (x, y) { return x + (Number(y) || 0); }, 0);
    }, 0);
    html.push('<td class="sum-col">' + grand + '</td>');
    html.push('<td class="row-actions"></td>');
    html.push('</tr>');
    html.push('</tbody>');

    tableEl.innerHTML = html.join('');
    bindTableEvents();
  };

  function bindTableEvents() {
    tableEl.querySelectorAll('input, select, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var phase = parseInt(el.getAttribute('data-phase'), 10);
      var line = parseInt(el.getAttribute('data-line'), 10);

      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          if (act === 'phase-up')   PT.movePhase(phase, -1);
          else if (act === 'phase-down') PT.movePhase(phase, 1);
          else if (act === 'phase-del')  PT.removePhase(phase);
          else if (act === 'line-del')   PT.removeLine(line);
        });
        return;
      }

      if (act === 'cell') {
        // Live-Update für Charts/Heatmap, ohne Tabelle neu zu rendern (kein Focus-Verlust)
        el.addEventListener('input', function () {
          PT.setLineValue(line, phase, el.value);
          PT.save();
          updateRowAndColumnSums();
          PT.refreshDerivedViews();
        });
        return;
      }

      if (act === 'line-color') {
        el.addEventListener('input', function () {
          PT.state.lines[line].color = el.value;
          PT.save();
          PT.refreshDerivedViews();
        });
        return;
      }

      if (act === 'line-name') {
        el.addEventListener('change', function () {
          PT.state.lines[line].name = el.value;
          PT.save();
          PT.refreshDerivedViews();
        });
        return;
      }

      if (act === 'phase-name') {
        el.addEventListener('change', function () {
          PT.state.phases[phase].name = el.value;
          PT.save();
          PT.refreshDerivedViews();
          PT.renderProcess();
          PT.renderHeatmap();
        });
        return;
      }

      if (act === 'phase-group') {
        el.addEventListener('change', function () {
          PT.state.phases[phase].group = el.value;
          PT.save();
          PT.renderProcess();
        });
        return;
      }
    });
  }

  function updateRowAndColumnSums() {
    if (!tableEl) return;
    var s = PT.state;
    var rows = tableEl.querySelectorAll('tbody tr[data-phase]');
    rows.forEach(function (tr) {
      var pi = parseInt(tr.getAttribute('data-phase'), 10);
      var sum = 0;
      s.lines.forEach(function (l) { sum += Number(l.values[pi]) || 0; });
      var sumCell = tr.querySelector('td.sum-col');
      if (sumCell) sumCell.textContent = sum;
    });
    // Spaltensummen sind in der letzten tbody-tr
    var lastRow = tableEl.querySelector('tbody tr:last-child');
    if (!lastRow) return;
    var sumCells = lastRow.querySelectorAll('td.sum-col');
    var grand = 0;
    s.lines.forEach(function (l, idx) {
      var v = l.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += v;
      if (sumCells[idx]) sumCells[idx].textContent = v;
    });
    if (sumCells[sumCells.length - 1]) sumCells[sumCells.length - 1].textContent = grand;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
