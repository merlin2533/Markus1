/* pivot.js – Ad-hoc-Analyse mit PivotTable.js (Drag&Drop).
   Datensatz-Auswahl je Bereich; Felder per Drag&Drop auf Zeilen/Spalten/Werte;
   Export der aktuellen Ansicht als Excel. */
(function (POL) {
  'use strict';

  var DEFAULTS = {
    personal: { rows: ['Abteilung'], cols: ['Beamtenstatus'], vals: ['Personalstand'] },
    finanzen: { rows: ['Abteilung'], cols: ['Kostenart'], vals: ['Betrag'] },
    fuhrpark: { rows: ['Fahrzeugklasse'], cols: ['Abteilung'], vals: ['Bestand'] },
    einsatz: { rows: ['Abteilung'], cols: ['Einsatzart'], vals: ['Stunden'] },
  };

  function records(bereich) { return POL.data.bereiche[bereich].fakten; }

  POL.viewPivot = function () {
    var wrap = POL.el('div', 'view');
    var head = POL.el('div', 'view-head');
    var opts = POL.BEREICHE.map(function (b) {
      return '<option value="' + b.id + '">' + b.icon + ' ' + b.label + '</option>';
    }).join('');
    head.innerHTML = '<h2>🧮 Ad-hoc-Analyse (Pivot)</h2>' +
      '<p class="view-sub">Felder per <strong>Drag&amp;Drop</strong> auf Zeilen, Spalten und Werte ziehen. ' +
      'Aggregation (Sum/Count/Average) und Darstellung (Table, Bar Chart, Heatmap) oben links wählbar.</p>' +
      '<div class="pivot-toolbar no-print">' +
      '<label class="sel-label">Datensatz <select id="pvDataset">' + opts + '</select></label>' +
      '<button class="btn btn-sm" id="pvExport">Ansicht als Excel</button></div>';
    wrap.appendChild(head);

    var out = POL.el('div', 'pivot-output');
    out.id = 'pivotOutput';
    wrap.appendChild(out);

    POL._afterRender = function () {
      if (typeof window.jQuery === 'undefined' || !window.jQuery.fn.pivotUI) {
        out.innerHTML = '<p class="hint">PivotTable.js konnte nicht geladen werden (Internetzugang prüfen).</p>';
        return;
      }
      var $ = window.jQuery;
      function build(bereich) {
        var d = DEFAULTS[bereich];
        $('#pivotOutput').pivotUI(records(bereich), {
          rows: d.rows, cols: d.cols, vals: d.vals,
          aggregatorName: 'Sum', rendererName: 'Table',
          rendererOptions: { heatmap: {} },
        }, true);
      }
      build('personal');
      document.getElementById('pvDataset').addEventListener('change', function (e) {
        build(e.target.value);
      });
      document.getElementById('pvExport').addEventListener('click', exportPivot);
    };

    return wrap;
  };

  // exportiert die aktuell gerenderte Pivot-Tabelle als Excel
  function exportPivot() {
    if (typeof XLSX === 'undefined') { alert('SheetJS nicht verfügbar.'); return; }
    var table = document.querySelector('#pivotOutput table.pvtTable');
    if (!table) { alert('Keine Tabellen-Ansicht zum Export (bitte Renderer „Table" wählen).'); return; }
    var aoa = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      var row = [];
      tr.querySelectorAll('th,td').forEach(function (c) {
        var span = parseInt(c.getAttribute('colspan') || '1', 10);
        var txt = c.textContent.trim();
        row.push(txt);
        for (var i = 1; i < span; i++) row.push('');
      });
      aoa.push(row);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Pivot');
    XLSX.writeFile(wb, 'pivot_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

})(window.POL);
