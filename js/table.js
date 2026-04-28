/* Tabellen-Renderer für Linien und Rollen.
   - Linien-Tabelle: #dataTable
   - Rollen-Tabelle: #roleTable
   Phase-Zeilen mit kind='main'/fixed=true sind nicht löschbar/verschiebbar/umbenennbar.
   Live-Updates aller Summen (Zeile, Gruppe, Spalte) via data-Attribute. */
(function (PT) {
  'use strict';

  var roleTableEl = null;

  PT.initTable = function () {
    roleTableEl = document.getElementById('roleTable');
  };

  PT.renderTable = function () {
    if (!roleTableEl) return;
    roleTableEl.innerHTML = buildSeriesTableHtml({
      kind: 'role',
      series: PT.state.roles,
      addLabel: 'Rolle hinzufügen',
      seriesLabel: 'Rolle'
    });
    bindSeriesTableEvents(roleTableEl, 'role');
  };

  PT.renderRoleTable = PT.renderTable; // gleiche Funktion rendert beide

  /* ===== Gruppen-Berechnung ===== */
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

  /* ===== HTML-Builder ===== */
  function buildSeriesTableHtml(opts) {
    var s = PT.state;
    var series = opts.series;
    var kind = opts.kind; // 'line' | 'role'
    var html = [];
    var groups = buildGroups(s.phases);

    // Header
    html.push('<thead><tr>');
    html.push('<th class="phase-col">Phase</th>');
    series.forEach(function (item, ii) {
      html.push(
        '<th class="line-header" data-' + kind + '-idx="' + ii + '" draggable="true">' +
          '<div class="line-head-row">' +
            '<span class="drag-handle" aria-hidden="true" title="Spalte verschieben">⋮⋮</span>' +
            '<input type="color" data-act="' + kind + '-color" data-idx="' + ii + '" value="' + escapeAttr(item.color) +
              '" aria-label="Farbe der ' + opts.seriesLabel + ' ' + escapeAttr(item.name) + '" title="Farbe" />' +
            '<input type="text" data-act="' + kind + '-name" data-idx="' + ii + '" value="' + escapeAttr(item.name) +
              '" aria-label="Name der ' + opts.seriesLabel + '" />' +
            '<button type="button" class="icon-btn" data-act="' + kind + '-del" data-idx="' + ii +
              '" aria-label="' + opts.seriesLabel + ' ' + escapeAttr(item.name) + ' löschen" title="löschen">×</button>' +
          '</div>' +
        '</th>'
      );
    });
    html.push('<th class="sum-col">Summe</th>');
    html.push('<th class="row-actions" aria-label="Aktionen"></th>');
    html.push('</tr></thead>');

    // Body
    html.push('<tbody>');
    s.phases.forEach(function (phase, pi) {
      var rowSum = 0;
      var fixedCls = phase.fixed ? ' phase-fixed' : '';
      html.push('<tr class="phase-row' + fixedCls + '" data-phase="' + pi + '"' +
                (phase.fixed ? '' : ' draggable="true"') + '>');

      var nameCell = phase.fixed
        ? '<span class="phase-fixed-name" title="Hauptphase – fest">' + escapeHtml(phase.name) + '</span>' +
          '<span class="phase-kind-badge" title="Hauptphase">main</span>'
        : '<span class="drag-handle" aria-hidden="true" title="Zeile verschieben">⋮⋮</span>' +
          '<button type="button" class="icon-btn move" data-act="phase-up" data-phase="' + pi +
            '" aria-label="Phase nach oben" title="Hoch">▲</button>' +
          '<button type="button" class="icon-btn move" data-act="phase-down" data-phase="' + pi +
            '" aria-label="Phase nach unten" title="Runter">▼</button>' +
          '<input type="text" data-act="phase-name" data-phase="' + pi + '" value="' + escapeAttr(phase.name) +
            '" aria-label="Sub-Phasenname" />' +
          '<span class="phase-kind-badge sub" title="Sub-Phase (Realisierung)">sub</span>';

      html.push(
        '<td class="phase-col">' +
          '<div class="phase-name-cell">' + nameCell + '</div>' +
        '</td>'
      );
      series.forEach(function (item, ii) {
        var v = Number(item.values[pi]) || 0;
        rowSum += v;
        html.push(
          '<td>' +
            '<input type="number" min="0" max="' + PT.MAX_VALUE + '" step="1" data-act="' + kind +
              '-cell" data-idx="' + ii + '" data-phase="' + pi + '" value="' + v +
              '" aria-label="Tage für ' + escapeAttr(item.name) + ' in ' + escapeAttr(phase.name) + '" />' +
          '</td>'
        );
      });
      html.push('<td class="sum-col" data-row-sum="' + pi + '">' + rowSum + '</td>');
      html.push('<td class="row-actions">');
      if (!phase.fixed) {
        html.push(
          '<button type="button" class="icon-btn" data-act="phase-del" data-phase="' + pi +
            '" aria-label="Sub-Phase ' + escapeAttr(phase.name) + ' löschen" title="löschen">×</button>'
        );
      }
      html.push('</td></tr>');

      // Gruppen-Summenzeile
      var grp = groups.find(function (g) { return g.end === pi && g.name; });
      if (grp) html.push(buildGroupSumRow(grp, series, kind));
    });

    // Spaltensumme
    html.push(buildColumnSumRow(series, kind));
    html.push('</tbody>');
    return html.join('');
  }

  function buildGroupSumRow(grp, series, kind) {
    var html = [];
    html.push('<tr class="group-sum-row" data-group-from="' + grp.start + '" data-group-to="' + grp.end + '">');
    html.push('<td class="phase-col group-sum-label">Σ ' + escapeHtml(grp.name) + '</td>');
    var grandG = 0;
    series.forEach(function (item, ii) {
      var sum = 0;
      for (var k = grp.start; k <= grp.end; k++) sum += Number(item.values[k]) || 0;
      grandG += sum;
      html.push('<td class="sum-col group-sum-cell" data-group-' + kind + '="' + ii + '">' + sum + '</td>');
    });
    html.push('<td class="sum-col group-sum-cell group-sum-total">' + grandG + '</td>');
    html.push('<td class="row-actions"></td>');
    html.push('</tr>');
    return html.join('');
  }

  function buildColumnSumRow(series, kind) {
    var html = [];
    html.push('<tr class="column-sum-row">');
    html.push('<td class="phase-col column-sum-label">Σ pro ' + (kind === 'line' ? 'Linie' : 'Rolle') + '</td>');
    var grand = 0;
    series.forEach(function (item, ii) {
      var sum = item.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += sum;
      html.push('<td class="sum-col column-sum-cell" data-col-' + kind + '="' + ii + '">' + sum + '</td>');
    });
    html.push('<td class="sum-col column-sum-cell column-sum-grand">' + grand + '</td>');
    html.push('<td class="row-actions"></td>');
    html.push('</tr>');
    return html.join('');
  }

  /* ===== Live-Update aller Summen (für beide Tabellen) ===== */
  function updateAllSumsFor(rootEl, series, kind) {
    if (!rootEl) return;
    rootEl.querySelectorAll('td[data-row-sum]').forEach(function (cell) {
      var pi = parseInt(cell.getAttribute('data-row-sum'), 10);
      var sum = 0;
      series.forEach(function (item) { sum += Number(item.values[pi]) || 0; });
      cell.textContent = sum;
    });
    rootEl.querySelectorAll('tr.group-sum-row').forEach(function (tr) {
      var from = parseInt(tr.getAttribute('data-group-from'), 10);
      var to   = parseInt(tr.getAttribute('data-group-to'), 10);
      var grandG = 0;
      tr.querySelectorAll('td[data-group-' + kind + ']').forEach(function (cell) {
        var ii = parseInt(cell.getAttribute('data-group-' + kind), 10);
        var sum = 0;
        for (var k = from; k <= to; k++) sum += Number(series[ii].values[k]) || 0;
        grandG += sum;
        cell.textContent = sum;
      });
      var totalCell = tr.querySelector('.group-sum-total');
      if (totalCell) totalCell.textContent = grandG;
    });
    var grand = 0;
    rootEl.querySelectorAll('td[data-col-' + kind + ']').forEach(function (cell) {
      var ii = parseInt(cell.getAttribute('data-col-' + kind), 10);
      var sum = series[ii].values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += sum;
      cell.textContent = sum;
    });
    var grandCell = rootEl.querySelector('.column-sum-grand');
    if (grandCell) grandCell.textContent = grand;
  }

  PT.updateAllSums = function () {
    if (roleTableEl) updateAllSumsFor(roleTableEl, PT.state.roles, 'role');
  };

  /* ===== Events ===== */
  var debouncedRefresh = null;
  function ensureDebouncedRefresh() {
    if (!debouncedRefresh && typeof PT.refreshDerivedViews === 'function') {
      debouncedRefresh = PT.debounce(PT.refreshDerivedViews, 100);
    }
    return debouncedRefresh;
  }
  var debouncedSave = PT.debounce(PT.save, 200);

  function confirmDeletion(label, hasValues) {
    if (!hasValues) return true;
    return confirm(label + ' löschen? Es sind Werte > 0 hinterlegt.');
  }

  function bindSeriesTableEvents(rootEl, kind) {
    var seriesArrName = kind === 'line' ? 'lines' : 'roles';

    bindRowDragDrop(rootEl);
    bindHeaderDragDrop(rootEl, kind);

    rootEl.querySelectorAll('input, select, button').forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (!act) return;
      var phase = parseInt(el.getAttribute('data-phase'), 10);
      var idx = parseInt(el.getAttribute('data-idx'), 10);

      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          if (act === 'phase-up')   PT.movePhase(phase, -1);
          else if (act === 'phase-down') PT.movePhase(phase, 1);
          else if (act === 'phase-del') {
            var hasVals = PT.state.lines.some(function (l) { return Number(l.values[phase]) > 0; }) ||
                          PT.state.roles.some(function (r) { return Number(r.values[phase]) > 0; });
            if (confirmDeletion('Sub-Phase „' + PT.state.phases[phase].name + '"', hasVals)) {
              PT.removePhase(phase);
            }
          } else if (act === kind + '-del') {
            var arr = PT.state[seriesArrName];
            var hv = arr[idx].values.some(function (v) { return Number(v) > 0; });
            var lab = (kind === 'line' ? 'Linie' : 'Rolle');
            if (confirmDeletion(lab + ' „' + arr[idx].name + '"', hv)) {
              if (kind === 'line') PT.removeLine(idx); else PT.removeRole(idx);
            }
          }
        });
        return;
      }

      if (act === kind + '-cell') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          var clamped = PT.clampValue(el.value);
          if (Number(el.value) !== clamped && el.value !== '') el.value = clamped;
          if (kind === 'line') PT.setLineValue(idx, phase, clamped);
          else PT.setRoleValue(idx, phase, clamped);
          PT.updateAllSums();
          debouncedSave();
          var refresh = ensureDebouncedRefresh();
          if (refresh) refresh();
        });
        return;
      }

      if (act === kind + '-color') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('input', function () {
          PT.state[seriesArrName][idx].color = el.value;
          PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }

      if (act === kind + '-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state[seriesArrName][idx].name = el.value;
          PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
        });
        return;
      }

      if (act === 'phase-name') {
        el.addEventListener('focus', function () { PT.pushHistory(); });
        el.addEventListener('change', function () {
          PT.state.phases[phase].name = el.value;
          PT.save();
          if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
          PT.renderProcess();
          PT.renderHeatmap();
        });
        return;
      }
    });
  }

  /* ===== Drag & Drop: Phasen-Zeilen (nur Sub-Phasen) ===== */
  function bindRowDragDrop(rootEl) {
    var dragSrcIdx = null;
    rootEl.querySelectorAll('tr.phase-row:not(.phase-fixed)').forEach(function (tr) {
      tr.addEventListener('dragstart', function (e) {
        dragSrcIdx = parseInt(tr.getAttribute('data-phase'), 10);
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragSrcIdx)); } catch (_) {}
      });
      tr.addEventListener('dragend', function () {
        tr.classList.remove('dragging');
        rootEl.querySelectorAll('.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        dragSrcIdx = null;
      });
      tr.addEventListener('dragover', function (e) {
        if (dragSrcIdx === null) return;
        var targetPhase = PT.state.phases[parseInt(tr.getAttribute('data-phase'), 10)];
        if (!targetPhase || targetPhase.fixed) return; // nur über Sub-Phasen droppen
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        rootEl.querySelectorAll('tr.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        tr.classList.add('drop-target');
      });
      tr.addEventListener('drop', function (e) {
        if (dragSrcIdx === null) return;
        e.preventDefault();
        var to = parseInt(tr.getAttribute('data-phase'), 10);
        if (!isNaN(to) && to !== dragSrcIdx) PT.movePhaseTo(dragSrcIdx, to);
      });
    });
  }

  /* ===== Drag & Drop: Linien-/Rollen-Header ===== */
  function bindHeaderDragDrop(rootEl, kind) {
    var dragSrcIdx = null;
    rootEl.querySelectorAll('th.line-header').forEach(function (th) {
      th.addEventListener('dragstart', function (e) {
        dragSrcIdx = parseInt(th.getAttribute('data-' + kind + '-idx'), 10);
        th.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', kind + ':' + dragSrcIdx); } catch (_) {}
      });
      th.addEventListener('dragend', function () {
        th.classList.remove('dragging');
        rootEl.querySelectorAll('th.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        dragSrcIdx = null;
      });
      th.addEventListener('dragover', function (e) {
        if (dragSrcIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        rootEl.querySelectorAll('th.drop-target').forEach(function (n) { n.classList.remove('drop-target'); });
        th.classList.add('drop-target');
      });
      th.addEventListener('drop', function (e) {
        if (dragSrcIdx === null) return;
        e.preventDefault();
        var to = parseInt(th.getAttribute('data-' + kind + '-idx'), 10);
        if (isNaN(to) || to === dragSrcIdx) return;
        if (kind === 'line') PT.moveLineTo(dragSrcIdx, to);
        else PT.moveRoleTo(dragSrcIdx, to);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

})(window.PT);
