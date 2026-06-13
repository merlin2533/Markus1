/* pivot.js – Ad-hoc-Analyse mit PivotTable.js (Drag&Drop).
   Mehrere Datensätze (inkl. Budget), Vorlagen, Diagramm-Renderer (Plotly),
   Excel-Export der Ansicht. */
(function (POL) {
  'use strict';

  var DATASETS = {
    personal: { label: '👮 Personal (Fakten)', get: function () { return POL.data.bereiche.personal.fakten; },
      def: { rows: ['Abteilung'], cols: ['Beamtenstatus'], vals: ['Personalstand'], agg: 'Sum' } },
    finanzen: { label: '💶 Finanzen (Kostenarten)', get: function () { return POL.data.bereiche.finanzen.fakten; },
      def: { rows: ['Abteilung'], cols: ['Kostenart'], vals: ['Betrag'], agg: 'Sum' } },
    budget: { label: '💰 Budget (Referat/Element)', get: function () { return POL.data.bereiche.finanzen.budget || []; },
      def: { rows: ['Referat'], cols: ['Budgetelement'], vals: ['Ist'], agg: 'Sum' } },
    fuhrpark: { label: '🚓 Fuhrpark', get: function () { return POL.data.bereiche.fuhrpark.fakten; },
      def: { rows: ['Fahrzeugklasse'], cols: ['Abteilung'], vals: ['Bestand'], agg: 'Sum' } },
    einsatz: { label: '🎯 Einsatz & Ausbildung', get: function () { return POL.data.bereiche.einsatz.fakten; },
      def: { rows: ['Abteilung'], cols: ['Einsatzart'], vals: ['Stunden'], agg: 'Sum' } },
  };

  // Schnell-Vorlagen
  var PRESETS = [
    { label: 'Krankheitstage: Abteilung × Altersgruppe', ds: 'personal',
      cfg: { rows: ['Abteilung'], cols: ['Altersgruppe'], vals: ['Krankheitstage'], agg: 'Sum', rnd: 'Heatmap' } },
    { label: 'Personalstand: Beamtenstatus × Laufbahn', ds: 'personal',
      cfg: { rows: ['Laufbahngruppe'], cols: ['Beamtenstatus'], vals: ['Personalstand'], agg: 'Sum', rnd: 'Table' } },
    { label: 'Überstunden je Abteilung (Balken)', ds: 'personal',
      cfg: { rows: ['Abteilung'], cols: [], vals: ['Ueberstunden'], agg: 'Sum', rnd: 'Bar Chart' } },
    { label: 'Budget: Referat × Budgetelement (Ist)', ds: 'budget',
      cfg: { rows: ['Referat'], cols: ['Budgetelement'], vals: ['Ist'], agg: 'Sum', rnd: 'Heatmap' } },
    { label: 'Kosten je Kostenart × Monat', ds: 'finanzen',
      cfg: { rows: ['Kostenart'], cols: ['Monat'], vals: ['Betrag'], agg: 'Sum', rnd: 'Table' } },
    { label: 'Fuhrpark: Verfügbar je Klasse', ds: 'fuhrpark',
      cfg: { rows: ['Fahrzeugklasse'], cols: [], vals: ['Verfuegbar'], agg: 'Sum', rnd: 'Bar Chart' } },
  ];

  POL.viewPivot = function () {
    var wrap = POL.el('div', 'view');
    var head = POL.el('div', 'view-head');
    var opts = Object.keys(DATASETS).map(function (id) {
      return '<option value="' + id + '">' + DATASETS[id].label + '</option>';
    }).join('');
    var presetBtns = PRESETS.map(function (p, i) {
      return '<button class="btn btn-sm preset-btn" data-i="' + i + '">' + p.label + '</button>';
    }).join('');

    head.innerHTML = '<h2>🧮 Ad-hoc-Analyse (Pivot)</h2>' +
      '<p class="view-sub">Felder per <strong>Drag&amp;Drop</strong> auf Zeilen, Spalten und Werte ziehen. ' +
      'Aggregation (Summe/Anzahl/Mittelwert) und Darstellung (Tabelle, Balken, Linie, Heatmap) oben links wählen.</p>' +
      '<div class="pivot-toolbar no-print">' +
        '<label class="sel-label">Datensatz <select id="pvDataset">' + opts + '</select></label>' +
        '<button class="btn btn-sm" id="pvReset">Zurücksetzen</button>' +
        '<button class="btn btn-sm" id="pvExport">Ansicht als Excel</button>' +
      '</div>' +
      '<div class="pivot-presets no-print"><span class="presets-label">Vorlagen:</span> ' + presetBtns + '</div>';
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
      var renderers = $.pivotUtilities.renderers;
      if ($.pivotUtilities.plotly_renderers) {
        renderers = $.extend({}, $.pivotUtilities.renderers, $.pivotUtilities.plotly_renderers);
      }

      function build(dsId, cfg) {
        var ds = DATASETS[dsId];
        cfg = cfg || ds.def;
        $('#pivotOutput').pivotUI(ds.get(), {
          rows: cfg.rows || [], cols: cfg.cols || [], vals: cfg.vals || [],
          aggregatorName: aggName(cfg.agg || 'Sum'),
          rendererName: cfg.rnd || 'Table',
          renderers: renderers,
          rendererOptions: { heatmap: {} },
          unusedAttrsVertical: false,
        }, true);
      }

      build('personal');
      document.getElementById('pvDataset').addEventListener('change', function (e) { build(e.target.value); });
      document.getElementById('pvReset').addEventListener('click', function () {
        build(document.getElementById('pvDataset').value);
      });
      document.getElementById('pvExport').addEventListener('click', exportPivot);
      wrap.querySelectorAll('.preset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var p = PRESETS[parseInt(btn.getAttribute('data-i'), 10)];
          document.getElementById('pvDataset').value = p.ds;
          build(p.ds, p.cfg);
        });
      });
    };

    return wrap;
  };

  // Aggregatorname an PivotTable.js (englische Standardnamen)
  function aggName(a) {
    var map = { Sum: 'Sum', Count: 'Count', Average: 'Average', Integer: 'Integer Sum' };
    return map[a] || 'Sum';
  }

  function exportPivot() {
    if (typeof XLSX === 'undefined') { alert('SheetJS nicht verfügbar.'); return; }
    var table = document.querySelector('#pivotOutput table.pvtTable');
    if (!table) { alert('Keine Tabellen-Ansicht zum Export (Renderer „Table" oder „Heatmap" wählen).'); return; }
    var aoa = [];
    table.querySelectorAll('tr').forEach(function (tr) {
      var row = [];
      tr.querySelectorAll('th,td').forEach(function (c) {
        var span = parseInt(c.getAttribute('colspan') || '1', 10);
        row.push(c.textContent.trim());
        for (var i = 1; i < span; i++) row.push('');
      });
      aoa.push(row);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Pivot');
    XLSX.writeFile(wb, 'pivot_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

})(window.POL);
