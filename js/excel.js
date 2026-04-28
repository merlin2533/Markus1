/* XLSX Import/Export via SheetJS (window.XLSX). */
(function (PT) {
  'use strict';

  var SHEET_PHASES = 'Phasen';
  var SHEET_LINES  = 'Linien';
  var SHEET_ROLES  = 'Rollen';
  var TOTAL_MARK   = '__GESAMT__';

  PT.exportXlsx = function () {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) konnte nicht geladen werden. Prüfen Sie Ihre Internetverbindung.');
      return;
    }
    var s = PT.state;
    var wb = XLSX.utils.book_new();

    // Phasen mit Kind-Spalte
    var phaseRows = [['Phase', 'Gruppe', 'Kind']];
    s.phases.forEach(function (p) { phaseRows.push([p.name, p.group || '', p.kind || 'sub']); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(phaseRows), SHEET_PHASES);

    var lineRows = buildSeriesRows(s.phases, s.lines);
    lineRows.push([TOTAL_MARK, s.totalColor].concat(emptyCols(s.phases.length)));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lineRows), SHEET_LINES);

    var roleRows = buildSeriesRows(s.phases, s.roles);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roleRows), SHEET_ROLES);

    var stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'projekt-phasen_' + stamp + '.xlsx');
  };

  function buildSeriesRows(phases, series) {
    var rows = [];
    rows.push(['Name', 'Farbe'].concat(phases.map(function (p) { return p.name; })));
    series.forEach(function (item) {
      rows.push([item.name, item.color].concat(item.values.slice()));
    });
    return rows;
  }
  function emptyCols(n) { var a = []; for (var i = 0; i < n; i++) a.push(''); return a; }

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
    if (phases.length === 0) throw new Error('Keine Phasen in Sheet "' + SHEET_PHASES + '" gefunden.');

    var n = phases.length;
    var linesParsed = parseSeriesSheet(linesSheet, n, /*allowTotal=*/true);
    var rolesParsed = parseSeriesSheet(rolesSheet, n, /*allowTotal=*/false);

    return {
      phases: phases,
      lines: linesParsed.series,
      roles: rolesParsed.series,
      totalColor: linesParsed.totalColor || '#3E6B1F',
      showTotal: true
    };
  }

  function parseSeriesSheet(sheet, n, allowTotal) {
    var result = { series: [], totalColor: null };
    if (!sheet) return result;
    var arr = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (var r = 1; r < arr.length; r++) {
      var row = arr[r];
      var name = String(row[0] || '').trim();
      if (!name) continue;
      var color = String(row[1] || '').trim() || '#888888';
      if (allowTotal && name === TOTAL_MARK) {
        result.totalColor = color;
        continue;
      }
      var values = [];
      for (var k = 0; k < n; k++) {
        var raw = row[2 + k];
        var num = Number(raw);
        values.push(isFinite(num) ? num : 0);
      }
      result.series.push({ id: PT.uid(), name: name, color: color, values: values });
    }
    return result;
  }

})(window.PT);
