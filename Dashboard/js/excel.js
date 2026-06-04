/* XLSX Import/Export via SheetJS.
   Sheets: Phasen, Linien (Tage), Rollen (Prozente).
*/
(function (PT) {
  'use strict';

  var SHEET_PHASES = 'Phasen';
  var SHEET_LINES  = 'Linien';
  var SHEET_ROLES  = 'Rollen';
  var TOTAL_MARK   = '__GESAMT__';

  PT.exportXlsx = function () {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) konnte nicht geladen werden.');
      return;
    }
    var s = PT.state;
    var wb = XLSX.utils.book_new();

    var phaseRows = [['Phase', 'Gruppe', 'Kind']];
    s.phases.forEach(function (p) { phaseRows.push([p.name, p.group || '', p.kind || 'sub']); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phaseRows), SHEET_PHASES);

    var lineRows = [['Name', 'Farbe'].concat(s.phases.map(function (p) { return p.name; }))];
    s.lines.forEach(function (l) {
      lineRows.push([l.name, l.color].concat(l.values.slice()));
    });
    lineRows.push([TOTAL_MARK, s.totalColor].concat(emptyCols(s.phases.length)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lineRows), SHEET_LINES);

    // Rollen: Name, Farbe, dann pro Linie ein Prozentwert
    var roleRows = [['Name', 'Farbe'].concat(s.lines.map(function (l) { return l.name + ' (%)'; }))];
    s.roles.forEach(function (r) {
      roleRows.push([r.name, r.color].concat(r.percentages.slice()));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roleRows), SHEET_ROLES);

    var stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'projekt-phasen_' + stamp + '.xlsx');
  };

  function emptyCols(n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; }

  function checkXlsx() {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) konnte nicht geladen werden.');
      return false;
    }
    return true;
  }
  function stamp() { return new Date().toISOString().slice(0, 10); }

  /* Nur Linien-Tabelle exportieren (Phasen + Linien + Zeilen-/Spalten-/Gruppensummen). */
  PT.exportLinesXlsx = function () {
    if (!checkXlsx()) return;
    var s = PT.state;
    var wb = XLSX.utils.book_new();

    var phaseRows = [['Phase', 'Gruppe', 'Kind']];
    s.phases.forEach(function (p) { phaseRows.push([p.name, p.group || '', p.kind || 'sub']); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phaseRows), SHEET_PHASES);

    var header = ['Phase'].concat(s.lines.map(function (l) { return l.name; })).concat(['Σ Zeile']);
    var rows = [header];
    s.phases.forEach(function (p, pi) {
      var row = [p.name];
      var sum = 0;
      s.lines.forEach(function (l) {
        var v = Number(l.values[pi]) || 0;
        sum += v; row.push(v);
      });
      row.push(sum);
      rows.push(row);
    });
    var sumRow = ['Σ pro Linie'];
    var grand = 0;
    s.lines.forEach(function (l) {
      var sum = l.values.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
      grand += sum; sumRow.push(sum);
    });
    sumRow.push(grand);
    rows.push(sumRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Tage_pro_Phase');

    XLSX.writeFile(wb, 'linien_' + stamp() + '.xlsx');
  };

  /* Nur die Prozent-Matrix exportieren. */
  PT.exportRolesXlsx = function () {
    if (!checkXlsx()) return;
    var s = PT.state;
    var wb = XLSX.utils.book_new();

    var header = ['Rolle'].concat(s.lines.map(function (l) { return l.name + ' (%)'; }))
                          .concat(['Σ %', 'Tage gesamt (berechnet)']);
    var rows = [header];
    s.roles.forEach(function (r, ri) {
      var row = [r.name];
      var pctSum = 0;
      r.percentages.forEach(function (p) { var v = Number(p) || 0; pctSum += v; row.push(v); });
      row.push(pctSum);
      row.push(Math.round(PT.roleSumDays(ri) * 10) / 10);
      rows.push(row);
    });
    var colSumRow = ['Σ % (Soll: 100)'];
    s.lines.forEach(function (_, li) {
      var sum = s.roles.reduce(function (a, r) { return a + (Number(r.percentages[li]) || 0); }, 0);
      colSumRow.push(sum);
    });
    colSumRow.push('', '');
    rows.push(colSumRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Verteilung_in_Prozent');

    XLSX.writeFile(wb, 'rollen_verteilung_' + stamp() + '.xlsx');
  };

  /* Berechnete Werte: Aufwandsverlauf (Linien + Rollen-Aggregat + Gesamt) je Phase. */
  PT.exportComputedXlsx = function () {
    if (!checkXlsx()) return;
    var s = PT.state;
    var wb = XLSX.utils.book_new();

    var header = ['Phase'].concat(s.lines.map(function (l) { return l.name; }))
                          .concat(s.roles.map(function (r) { return r.name + ' (Zusatz)'; }))
                          .concat(['Gesamt (Linien)', 'Gesamt inkl. Zusatz']);
    var rows = [header];
    s.phases.forEach(function (p, pi) {
      var row = [p.name];
      var sumLine = 0, sumRole = 0;
      s.lines.forEach(function (l) {
        var v = Number(l.values[pi]) || 0; sumLine += v; row.push(v);
      });
      s.roles.forEach(function (_, ri) {
        var v = PT.roleDayInPhase(ri, pi);
        sumRole += v;
        row.push(Math.round(v * 10) / 10);
      });
      row.push(sumLine);
      row.push(Math.round((sumLine + sumRole) * 10) / 10);
      rows.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Aufwandsverlauf');

    XLSX.writeFile(wb, 'aufwandsverlauf_' + stamp() + '.xlsx');
  };

  /* Heatmap: berechnete Rollen-Tage je Phase. */
  PT.exportHeatmapXlsx = function () {
    if (!checkXlsx()) return;
    var s = PT.state;
    var wb = XLSX.utils.book_new();
    var header = ['Rolle'].concat(s.phases.map(function (p) { return p.name; })).concat(['Σ Tage']);
    var rows = [header];
    s.roles.forEach(function (r, ri) {
      var row = [r.name];
      var sum = 0;
      s.phases.forEach(function (_, pi) {
        var v = PT.roleDayInPhase(ri, pi);
        sum += v;
        row.push(Math.round(v * 10) / 10);
      });
      row.push(Math.round(sum * 10) / 10);
      rows.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Schwerpunkte_Rollen');
    XLSX.writeFile(wb, 'schwerpunkte_' + stamp() + '.xlsx');
  };

  PT.importXlsx = function (file) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) konnte nicht geladen werden.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var newState = parseWorkbook(wb);
        if (!newState) { alert('Datei konnte nicht ausgewertet werden.'); return; }
        PT.pushHistory();
        PT.state = PT.normalize(newState);
        PT.notify();
      } catch (err) {
        console.error(err);
        alert('Import fehlgeschlagen: ' + err.message);
      }
    };
    reader.onerror = function () { alert('Datei konnte nicht gelesen werden.'); };
    reader.readAsArrayBuffer(file);
  };

  function parseWorkbook(wb) {
    var phasesSheet = wb.Sheets[SHEET_PHASES];
    var linesSheet  = wb.Sheets[SHEET_LINES];
    var rolesSheet  = wb.Sheets[SHEET_ROLES];
    if (!phasesSheet) throw new Error('Sheet "' + SHEET_PHASES + '" fehlt.');

    var phasesArr = XLSX.utils.sheet_to_json(phasesSheet, { header: 1, defval: '' });
    var phases = [];
    for (var i = 1; i < phasesArr.length; i++) {
      var name = String(phasesArr[i][0] || '').trim();
      if (!name) continue;
      var group = String(phasesArr[i][1] || '').trim();
      var kind = String(phasesArr[i][2] || '').trim() || 'sub';
      phases.push({ id: PT.uid(), name: name, group: group, kind: kind, fixed: kind === 'main' });
    }
    if (phases.length === 0) throw new Error('Keine Phasen in "' + SHEET_PHASES + '".');

    var n = phases.length;
    var linesParsed = parseLinesSheet(linesSheet, n);
    var rolesParsed = parseRolesSheet(rolesSheet, linesParsed.lines.length);

    return {
      phases: phases,
      lines: linesParsed.lines,
      roles: rolesParsed,
      totalColor: linesParsed.totalColor || '#3E6B1F',
      showTotal: true,
      showZusatz: false,
      showNormal: true,
      showLabels: false
    };
  }

  function parseLinesSheet(sheet, n) {
    var result = { lines: [], totalColor: null };
    if (!sheet) return result;
    var arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (var r = 1; r < arr.length; r++) {
      var row = arr[r];
      var name = String(row[0] || '').trim();
      if (!name) continue;
      var color = String(row[1] || '').trim() || '#888888';
      if (name === TOTAL_MARK) { result.totalColor = color; continue; }
      var values = [];
      for (var k = 0; k < n; k++) {
        var num = Number(row[2 + k]);
        values.push(isFinite(num) ? num : 0);
      }
      result.lines.push({ id: PT.uid(), name: name, color: color, values: values });
    }
    return result;
  }

  function parseRolesSheet(sheet, L) {
    if (!sheet) return [];
    var roles = [];
    var arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (var r = 1; r < arr.length; r++) {
      var row = arr[r];
      var name = String(row[0] || '').trim();
      if (!name) continue;
      var color = String(row[1] || '').trim() || '#888888';
      var pct = [];
      for (var k = 0; k < L; k++) {
        var num = Number(row[2 + k]);
        pct.push(isFinite(num) ? num : 0);
      }
      roles.push({ id: PT.uid(), name: name, color: color, percentages: pct });
    }
    return roles;
  }

})(window.PT);
