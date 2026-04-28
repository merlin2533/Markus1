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
