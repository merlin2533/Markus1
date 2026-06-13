/* detail.js – Detailseite einer Kennzahl: Verlauf + Ziel, Vergleichswerte,
   Aufschlüsselung nach Dimension, Excel-Export. */
(function (POL) {
  'use strict';

  function statBox(label, value, sub, cls) {
    return '<div class="stat ' + (cls || '') + '"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  }

  POL.viewDetail = function (bereichId, kpiId) {
    var kpi = POL.kpi(bereichId, kpiId);
    if (!kpi) { var e = POL.el('div', 'view'); e.innerHTML = '<p>Kennzahl nicht gefunden.</p>'; return e; }
    var meta = POL.bereichMeta(bereichId);
    var cur = POL.current(kpi), prev = POL.previous(kpi), yoy = POL.yoy(kpi);
    var z = POL.ziel(kpi), status = POL.ampel(kpi), d = POL.delta(kpi), ytd = POL.ytd(kpi);

    var wrap = POL.el('div', 'view');

    var head = POL.el('div', 'view-head');
    head.innerHTML = '<a class="back-link no-print" href="#/' + bereichId + '">← ' + meta.label + '</a>' +
      '<h2><span style="color:' + meta.farbe + '">' + meta.icon + '</span> ' + kpi.label + ' ' + POL.ampelDot(status) + '</h2>' +
      '<p class="view-sub">' + (kpi.beschreibung || '') + '</p>';
    wrap.appendChild(head);

    // Vergleichs-Kacheln
    var dYoY = yoy && yoy.value ? ((cur.value - yoy.value) / Math.abs(yoy.value)) * 100 : null;
    var stats = POL.el('div', 'stat-row');
    stats.innerHTML =
      statBox('Aktuell (' + POL.monatLabel(cur.monat) + ')', POL.formatValue(kpi, cur.value), 'heute', 'stat-big') +
      statBox('Vormonat', POL.formatValue(kpi, prev.value),
        d ? '<span class="' + (d.gut === true ? 'good' : d.gut === false ? 'bad' : '') + '">' +
          (d.abs > 0 ? '▲' : d.abs < 0 ? '▼' : '▬') + ' ' + POL.fmt.signed(d.pct, 1) + ' %</span>' : '') +
      statBox('Vorjahr (YoY)', yoy ? POL.formatValue(kpi, yoy.value) : '–',
        dYoY != null ? POL.fmt.signed(dYoY, 1) + ' %' : 'k. A.') +
      statBox('Ziel', z ? POL.formatValue(kpi, z.Zielwert) : '–',
        '<span class="ampel-txt ampel-txt-' + status + '">' + POL.AMPEL_LABEL[status] + '</span>') +
      statBox(ytd.additiv ? 'YTD (kumuliert)' : 'YTD (Ø)',
        POL.formatValue(kpi, ytd.additiv ? ytd.sum : ytd.avg), ytd.monate + ' Monate');
    wrap.appendChild(stats);

    // Verlauf
    var trend = POL.el('section', 'panel print-keep');
    trend.innerHTML = '<div class="panel-head"><h3>Verlauf & Ziel</h3>' +
      '<button class="btn btn-sm no-print" id="dtExport">Als Excel exportieren</button></div>' +
      '<div class="chart-box chart-box-lg"><canvas id="dtTrend"></canvas></div>';
    wrap.appendChild(trend);

    // Aufschlüsselung
    var brk = POL.el('section', 'panel print-keep');
    var dimOpts = kpi.dims.map(function (dm) { return '<option value="' + dm + '">' + dm + '</option>'; }).join('');
    brk.innerHTML = '<div class="panel-head"><h3>Aufschlüsselung (' + POL.monatLabel(cur.monat) + ')</h3>' +
      '<label class="sel-label no-print">nach <select id="dtDim">' + dimOpts + '</select></label></div>' +
      '<div class="brk-grid"><div class="chart-box"><canvas id="dtBreak"></canvas></div>' +
      '<div class="brk-table-wrap"><table class="brk-table" id="dtTable"></table></div></div>' +
      '<p class="hint no-print">Verteilung der zugrunde liegenden Messgröße „' + kpi.faktKey + '“.</p>';
    wrap.appendChild(brk);

    POL._afterRender = function () {
      var s = POL.series(kpi);
      var labels = s.map(function (p) { return POL.monatLabel(p.monat); });
      var ds = [{
        label: kpi.label, data: s.map(function (p) { return p.value; }),
        borderColor: meta.farbe, backgroundColor: meta.farbe + '15', fill: true,
        tension: 0.3, pointRadius: 0, borderWidth: 2,
      }];
      if (z) ds.push({
        label: 'Ziel', data: s.map(function () { return Number(z.Zielwert); }),
        borderColor: '#9aa0a6', borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false,
      });
      POL.lineChart(document.getElementById('dtTrend'), labels, ds, { beginAtZero: kpi.fmt !== 'percent' });

      function drawBreak() {
        var dim = document.getElementById('dtDim').value;
        var data = POL.breakdown(kpi, cur.monat, dim);
        POL.barChart(document.getElementById('dtBreak'),
          data.map(function (r) { return r.label; }),
          data.map(function (r) { return r.value; }), meta.farbe, true);
        var total = data.reduce(function (a, r) { return a + r.value; }, 0) || 1;
        document.getElementById('dtTable').innerHTML =
          '<thead><tr><th>' + dim + '</th><th class="num">' + kpi.faktKey + '</th><th class="num">Anteil</th></tr></thead><tbody>' +
          data.map(function (r) {
            return '<tr><td>' + r.label + '</td><td class="num">' + POL.fmt.int(r.value) + '</td>' +
              '<td class="num">' + POL.fmt.dec((r.value / total) * 100, 1) + ' %</td></tr>';
          }).join('') + '</tbody>';
      }
      document.getElementById('dtDim').addEventListener('change', drawBreak);
      drawBreak();
      document.getElementById('dtExport').addEventListener('click', function () {
        POL.exportKpi(kpi, document.getElementById('dtDim').value, cur.monat);
      });
    };

    return wrap;
  };

  // Export der KPI: Verlauf + aktuelle Aufschlüsselung
  POL.exportKpi = function (kpi, dim, monat) {
    if (typeof XLSX === 'undefined') { alert('SheetJS nicht verfügbar.'); return; }
    var wb = XLSX.utils.book_new();
    var s = POL.series(kpi);
    var verlauf = s.map(function (p) { var o = { Monat: p.monat }; o[kpi.label] = p.value; return o; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(verlauf), 'Verlauf');
    var bd = POL.breakdown(kpi, monat, dim).map(function (r) {
      var o = {}; o[dim] = r.label; o[kpi.faktKey] = r.value; return o;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bd), 'Aufschluesselung');
    XLSX.writeFile(wb, 'kpi_' + kpi.id + '_' + monat + '.xlsx');
  };

})(window.POL);
