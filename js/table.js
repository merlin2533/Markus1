/* Zwei Tabellen:
   1. #lineTable    – Tage pro Phase pro Linie (Werte = Tage)
   2. #percentTable – Verteilung Rolle pro Linie (Werte = %, 0..100)
*/
(function (PT) {
  'use strict';

  var lineTableEl = null;
  var pctTableEl = null;

  PT.initTable = function () {
    lineTableEl = document.getElementById('lineTable');
    pctTableEl  = document.getElementById('percentTable');
  };

  PT.renderTable = function () {
    if (lineTableEl) {
      lineTableEl.innerHTML = buildLineTableHtml();
      bindLineTable();
    }
    if (pctTableEl) {
      pctTableEl.innerHTML = buildPercentMatrixHtml();
      bindPercentTable();
    }
  };

  /* ===== Linien-Tabelle: Phasen × Linien (Tage) ===== */
  function buildGroups(phases) {
    var groups = [];
    var i = 0;
    while (i < phases.length) {
      var g = phases[i].group || '';
      var j = i + 1;
      while (j < phases.length && (phases[j].group || '') === g) j++;
      groups.push({ name: g, start: i, end: j - 1 });
      i = j;
    }
    return groups;
  }

  function buildLineTableHtml() {
    var s = PT.state;
    var html = [];
    var groups = buildGroups(s.phases);

    html.push('<thead><tr>');
    html.push('<th class="phase-col">Phase</th>');
    s.lines.forEach(function (line, li) {
      html.push(
        '<th class="line-header" data-line-idx="' + li + '" draggable="true">' +
          '<div class="line-head-row">' +
            '<span class="drag-handle" aria-hidden="true" title="Spalte verschieben">⋮⋮</span>' +
            '<input type="color" data-act="line-color" data-idx="' + li + '" value="' + esc(line.color) +
              '" aria-label="Farbe der Linie ' + esc(line.name) + '" title="Farbe" />' +
            '<input type="text" data-act="line-name" data-idx="' + li + '" value="' + esc(line.name) +
              '" aria-label="Name der Linie" />' +
            '<button type="button" class="icon-btn" data-act="line-del" data-idx="' + li +
              '" aria-label="Linie ' + esc(line.name) + ' löschen" title="löschen">×</button>' +
          '</div>' +
        '</th>'
      );
    });
    html.push('<th class="sum-col">Summe</th>');
    html.push('<th class="row-actions" aria-label="Aktionen"></th>');
    html.push('</tr></thead><tbody>');

    s.phases.forEach(function (phase, pi) {
      var rowSum = 0;
      var fixedCls = phase.fixed ? ' phase-fixed' : '';
      html.push('<tr class="phase-row' + fixedCls + '" data-phase="' + pi + '"' +
                (phase.fixed ? '' : ' draggable="true"') + '>');
      var nameCell = phase.fixed
        ? '<span class="phase-fixed-name" title="Hauptphase – fest">' + esc(phase.name) + '</span>' +
          '<span class="phase-kind-badge" title="Hauptphase">main</span>'
        : '<span class="drag-handle" aria-hidden="true" title="Zeile verschieben">⋮⋮</span>' +
          '<button type="button" class="icon-btn move" data-act="phase-up" data-phase="' + pi +
            '" aria-label="Phase nach oben" title="Hoch">▲</button>' +
          '<button type="button" class="icon-btn move" data-act="phase-down" data-phase="' + pi +
            '" aria-label="Phase nach unten" title="Runter">▼</button>' +
          '<input type="text" data-act="phase-name" data-phase="' + pi + '" value="' + esc(phase.name) +
            '" aria-label="Sub-Phasenname" />' +
          '<span class="phase-kind-badge sub" title="Sub-Phase (Realisierung)">sub</span>';
      html.push(
        '<td class="phase-col"><div class="phase-name-cell">' + nameCell + '</div></td>'
      );
      s.lines.forEach(function (line, li) {
        var v = Number(line.values[pi]) || 0;
        rowSum += v;
        html.push(
          '<td><input type="number" min="0" max="' + PT.MAX_VALUE + '" step="1" data-act="line-cell" data-idx="' +
            li + '" data-phase="' + pi + '" value="' + v +
            '" aria-label="Tage für ' + esc(line.name) + ' in ' + esc(phase.name) + '" /></td>'
        );
      });
      html.push('<td class="sum-col" data-row-sum="' + pi + '">' + rowSum + '</td>');
      html.push('<td class="row-actions">');
      if (!phase.fixed) {
        html.push(
          '<button type="button" class="icon-btn" data-act="phase-del" data-phase="' + pi +
            '" aria-label="Sub-Phase ' + esc(phase.name) + ' löschen" title="löschen">×</button>'
        );
      }
      html.push('</td></tr>');

      var grp = groups.find(function (g) { return g.end === pi && g.name; });
      if (grp) html.push(buildGroupSumRow(grp));
    });
    html.push(buildColumnSumRow());
    html.push('</tbody>');
    return html.join('');
  }

  function buildGroupSumRow(grp) {
    var s = PT.state;
    var html = [];
    html.push('<tr class="group-sum-row" data-group-from="' + grp.start + '" data-group-to="' + grp.end + '">');
    html.push('<td class="phase-col group-sum-label">Σ ' + esc(grp.name) + '</td>');
    var grandG = 0;
    s.lines.forEach(function (line, li) {
      var sum = 0;
      for (var k = grp.start; k <= grp.end; k++) sum += Number(line.values[k]) || 0;
      grandG += sum;
      html.push('<td class="sum-col group-sum-cell" data-group-line="' + li + '">' + sum + '</td>');
    });
    html.push('<td class="sum-col group-sum-cell group-sum-total">' + grandG + '</td>');
    html.push('<td class="row-actions"></td></tr>');
    return html.join('');
  }

  function buildColumnSumRow() {
    var s = PT.state;
    var html = [];
    html.push('<tr class="column-sum-row">');
    html.push('<td class="phase-col column-sum-label">Σ pro Linie</td>');
    var grand = 0;
    s.lines.forEach(function (line, li) {
      var sum = line.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += sum;
      html.push('<td class="sum-col column-sum-cell" data-col-line="' + li + '">' + sum + '</td>');
    });
    html.push('<td class="sum-col column-sum-cell column-sum-grand">' + grand + '</td>');
    html.push('<td class="row-actions"></td></tr>');
    return html.join('');
  }

  /* ===== Prozent-Matrix: Rollen × Linien (%) ===== */
  function buildPercentMatrixHtml() {
    var s = PT.state;
    var html = [];

    html.push('<thead><tr>');
    html.push('<th class="phase-col">Rolle</th>');
    s.lines.forEach(function (line, li) {
      html.push(
        '<th class="line-header" style="min-width:120px;">' +
          '<div class="line-head-row" style="justify-content:center;">' +
            '<span class="line-color-dot" style="background:' + esc(line.color) + ';"></span>' +
            '<span>' + esc(line.name) + '</span>' +
          '</div>' +
        '</th>'
      );
    });
    html.push('<th class="sum-col">Σ %</th>');
    html.push('<th class="sum-col">Tage gesamt</th>');
    html.push('<th class="row-actions"></th>');
    html.push('</tr></thead><tbody>');

    s.roles.forEach(function (role, ri) {
      var rowPctSum = 0;
      html.push('<tr data-role="' + ri + '">');
      html.push(
        '<td class="phase-col">' +
          '<div class="phase-name-cell">' +
            '<input type="color" data-act="role-color" data-role="' + ri + '" value="' + esc(role.color) +
              '" aria-label="Farbe der Rolle ' + esc(role.name) + '" title="Farbe" />' +
            '<input type="text" data-act="role-name" data-role="' + ri + '" value="' + esc(role.name) +
              '" aria-label="Rollenname" />' +
            '<button type="button" class="icon-btn" data-act="role-del" data-role="' + ri +
              '" aria-label="Rolle ' + esc(role.name) + ' löschen" title="löschen">×</button>' +
          '</div>' +
        '</td>'
      );
      s.lines.forEach(function (line, li) {
        var p = Number(role.percentages[li]) || 0;
        rowPctSum += p;
        html.push(
          '<td><input type="number" min="0" max="100" step="1" data-act="pct-cell" data-role="' + ri +
            '" data-line="' + li + '" value="' + p + '" ' +
            'aria-label="Prozent ' + esc(role.name) + ' an ' + esc(line.name) + '" /></td>'
        );
      });
      var totalDays = PT.roleSumDays(ri);
      html.push('<td class="sum-col" data-pct-row-sum="' + ri + '">' + rowPctSum + '%</td>');
      html.push('<td class="sum-col" data-role-days-total="' + ri + '">' + fmt(totalDays) + '</td>');
      html.push('<td class="row-actions"></td></tr>');
    });

    // Spalten-Summe (sollte je Linie 100% sein)
    html.push('<tr class="column-sum-row">');
    html.push('<td class="phase-col column-sum-label">Σ % (Soll: 100)</td>');
    var grand = 0;
    s.lines.forEach(function (line, li) {
      var sum = s.roles.reduce(function (a, r) { return a + (Number(r.percentages[li]) || 0); }, 0);
      grand += sum;
      var bad = sum !== 100 ? ' pct-bad' : '';
      html.push('<td class="sum-col column-sum-cell' + bad + '" data-pct-col-sum="' + li + '">' + sum + '%</td>');
    });
    html.push('<td class="sum-col column-sum-cell column-sum-grand">' + grand + '%</td>');
    html.push('<td class="sum-col"></td>');
    html.push('<td class="row-actions"></td></tr>');
    html.push('</tbody>');
    return html.join('');
  }

  /* ===== Sums-Update für beide Tabellen ===== */
  function updateLineSums() {
    if (!lineTableEl) return;
    var s = PT.state;
    lineTableEl.querySelectorAll('td[data-row-sum]').forEach(function (cell) {
      var pi = parseInt(cell.getAttribute('data-row-sum'), 10);
      var sum = 0;
      s.lines.forEach(function (l) { sum += Number(l.values[pi]) || 0; });
      cell.textContent = sum;
    });
    lineTableEl.querySelectorAll('tr.group-sum-row').forEach(function (tr) {
      var from = parseInt(tr.getAttribute('data-group-from'), 10);
      var to   = parseInt(tr.getAttribute('data-group-to'), 10);
      var grandG = 0;
      tr.querySelectorAll('td[data-group-line]').forEach(function (cell) {
        var li = parseInt(cell.getAttribute('data-group-line'), 10);
        var sum = 0;
        for (var k = from; k <= to; k++) sum += Number(s.lines[li].values[k]) || 0;
        grandG += sum;
        cell.textContent = sum;
      });
      var totalCell = tr.querySelector('.group-sum-total');
      if (totalCell) totalCell.textContent = grandG;
    });
    var grand = 0;
    lineTableEl.querySelectorAll('td[data-col-line]').forEach(function (cell) {
      var li = parseInt(cell.getAttribute('data-col-line'), 10);
      var sum = s.lines[li].values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += sum;
      cell.textContent = sum;
    });
    var grandCell = lineTableEl.querySelector('.column-sum-grand');
    if (grandCell) grandCell.textContent = grand;
  }

  function updatePercentSums() {
    if (!pctTableEl) return;
    var s = PT.state;
    // Row %-sums + Tage gesamt
    pctTableEl.querySelectorAll('td[data-pct-row-sum]').forEach(function (cell) {
      var ri = parseInt(cell.getAttribute('data-pct-row-sum'), 10);
      var sum = s.roles[ri].percentages.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      cell.textContent = sum + '%';
    });
    pctTableEl.querySelectorAll('td[data-role-days-total]').forEach(function (cell) {
      var ri = parseInt(cell.getAttribute('data-role-days-total'), 10);
      cell.textContent = fmt(PT.roleSumDays(ri));
    });
    // Col %-sums
    var grand = 0;
    pctTableEl.querySelectorAll('td[data-pct-col-sum]').forEach(function (cell) {
      var li = parseInt(cell.getAttribute('data-pct-col-sum'), 10);
      var sum = s.roles.reduce(function (a, r) { return a + (Number(r.percentages[li]) || 0); }, 0);
      grand += sum;
      cell.textContent = sum + '%';
      if (sum === 100) cell.classList.remove('pct-bad'); else cell.classList.add('pct-bad');
    });
    var grandCell = pctTableEl.querySelector('.column-sum-grand');
    if (grandCell) grandCell.textContent = grand + '%';
  }

  PT.updateAllSums = function () {
    updateLineSums();
    updatePercentSums();
  };

  /* ===== Events ===== */
  var debouncedRefresh = null;
  function ensureDebounced() {
    if (!debouncedRefresh && typeof PT.refreshDerivedViews === 'function') {
      debouncedRefresh = PT.debounce(PT.refreshDerivedViews, 100);
    }
    return debouncedRefresh;
  }
  var debouncedSave = PT.debounce(PT.save, 200);

  function confirmDel(label, hasVals) {
    if (!hasVals) return true;
    return confirm(label + ' löschen? Es sind Werte > 0 hinterlegt.');
  }

  function bindLineTable() {
    bindRowDragDrop(lineTableEl);
    bindHeaderDragDrop(lineTableEl);

    lineTableEl.querySelectorAll('input, select, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var phase = parseInt(el.getAttribute('data-phase'), 10);
      var idx   = parseInt(el.getAttribute('data-idx'), 10);

      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          if (act === 'phase-up')   PT.movePhase(phase, -1);
          else if (act === 'phase-down') PT.movePhase(phase, 1);
          else if (act === 'phase-del') {
            var hv = PT.state.lines.some(function (l) { return Number(l.values[phase]) > 0; });
            if (confirmDel('Sub-Phase „' + PT.state.phases[phase].name + '"', hv)) PT.removePhase(phase);
          } else if (act === 'line-del') {
            var hv2 = PT.state.lines[idx].values.some(function (v) { return Number(v) > 0; });
            if (confirmDel('Linie „' + PT.state.lines[idx].name + '"', hv2)) PT.removeLine(idx);
          }
        });
        return;
      }

      if (act === 'line-cell') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          var c = PT.clampValue(el.value);
          if (Number(el.value) !== c && el.value !== '') el.value = c;
          PT.setLineValue(idx, phase, c);
          PT.updateAllSums();
          debouncedSave();
          var r = ensureDebounced(); if (r) r();
        });
        return;
      }
      if (act === 'line-color') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          PT.state.lines[idx].color = el.value; PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }
      if (act === 'line-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state.lines[idx].name = el.value; PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }
      if (act === 'phase-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state.phases[phase].name = el.value; PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
          PT.renderProcess();
          PT.renderHeatmap();
        });
        return;
      }
    });
  }

  function bindPercentTable() {
    pctTableEl.querySelectorAll('input, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var role = parseInt(el.getAttribute('data-role'), 10);
      var line = parseInt(el.getAttribute('data-line'), 10);

      if (el.tagName === 'BUTTON' && act === 'role-del') {
        el.addEventListener('click', function () {
          var hv = PT.state.roles[role].percentages.some(function (v) { return Number(v) > 0; });
          if (confirmDel('Rolle „' + PT.state.roles[role].name + '"', hv)) PT.removeRole(role);
        });
        return;
      }
      if (act === 'role-color') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          PT.state.roles[role].color = el.value; PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }
      if (act === 'role-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state.roles[role].name = el.value; PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }
      if (act === 'pct-cell') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          var c = PT.clampPercent(el.value);
          if (Number(el.value) !== c && el.value !== '') el.value = c;
          PT.setRolePercent(role, line, c);
          updatePercentSums();
          debouncedSave();
          var r = ensureDebounced(); if (r) r();
        });
        return;
      }
    });
  }

  /* ===== Drag & Drop ===== */
  function bindRowDragDrop(rootEl) {
    var src = null;
    rootEl.querySelectorAll('tr.phase-row:not(.phase-fixed)').forEach(function (tr) {
      tr.addEventListener('dragstart', function (e) {
        src = parseInt(tr.getAttribute('data-phase'), 10);
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(src)); } catch (_) {}
      });
      tr.addEventListener('dragend', function () {
        tr.classList.remove('dragging');
        rootEl.querySelectorAll('.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        src = null;
      });
      tr.addEventListener('dragover', function (e) {
        if (src === null) return;
        var target = PT.state.phases[parseInt(tr.getAttribute('data-phase'), 10)];
        if (!target || target.fixed) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        rootEl.querySelectorAll('tr.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        tr.classList.add('drop-target');
      });
      tr.addEventListener('drop', function (e) {
        if (src === null) return;
        e.preventDefault();
        var to = parseInt(tr.getAttribute('data-phase'), 10);
        if (!isNaN(to) && to !== src) PT.movePhaseTo(src, to);
      });
    });
  }

  function bindHeaderDragDrop(rootEl) {
    var src = null;
    rootEl.querySelectorAll('th.line-header[data-line-idx]').forEach(function (th) {
      th.addEventListener('dragstart', function (e) {
        src = parseInt(th.getAttribute('data-line-idx'), 10);
        th.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', 'line:' + src); } catch (_) {}
      });
      th.addEventListener('dragend', function () {
        th.classList.remove('dragging');
        rootEl.querySelectorAll('th.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        src = null;
      });
      th.addEventListener('dragover', function (e) {
        if (src === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        rootEl.querySelectorAll('th.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        th.classList.add('drop-target');
      });
      th.addEventListener('drop', function (e) {
        if (src === null) return;
        e.preventDefault();
        var to = parseInt(th.getAttribute('data-line-idx'), 10);
        if (!isNaN(to) && to !== src) PT.moveLineTo(src, to);
      });
    });
  }

  function fmt(n) { return Math.round(n * 10) / 10; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})(window.PT);
