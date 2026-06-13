/* risk.js – Personalrisiko: Altersstruktur und Pensionierungs-/Abgangswelle.
   Projektion auf Basis der aktuellen Altersgruppen (Fakten, letzter Monat). */
(function (POL) {
  'use strict';

  var MID = { '<30': 26, '30–39': 35, '40–49': 45, '50–59': 55, '≥60': 62 };
  var GRUPPEN = ['<30', '30–39', '40–49', '50–59', '≥60'];
  var RUHESTAND = 63;     // angenommenes durchschnittliches Pensions-/Renteneintrittsalter
  var HORIZONT = 10;      // Projektionsjahre

  // aktuelle Köpfe je Altersgruppe × Beamtenstatus
  function snapshot() {
    var monat = POL.data.meta.stand;
    var fakten = POL.data.bereiche.personal.fakten;
    var agg = {}; // alter -> {Beamte, 'Nicht-Beamte', total}
    GRUPPEN.forEach(function (g) { agg[g] = { 'Beamte': 0, 'Nicht-Beamte': 0, total: 0 }; });
    fakten.forEach(function (r) {
      if (r.Monat !== monat) return;
      var a = agg[r.Altersgruppe]; if (!a) return;
      a[r.Beamtenstatus] += r.Personalstand;
      a.total += r.Personalstand;
    });
    return { monat: monat, agg: agg };
  }

  // verteilt eine Gruppe über die Jahre bis zum Ruhestand (±4 Jahre Streuung)
  function projektion(snap) {
    var jahr0 = parseInt(snap.monat.split('-')[0], 10);
    var byYear = []; // [{jahr, Beamte, NichtBeamte, total}]
    for (var i = 0; i < HORIZONT; i++) byYear.push({ jahr: jahr0 + i, Beamte: 0, 'Nicht-Beamte': 0, total: 0 });

    GRUPPEN.forEach(function (g) {
      var mid = MID[g];
      var ytr = Math.max(0, RUHESTAND - mid);   // Jahre bis Ruhestand (Gruppenmittel)
      ['Beamte', 'Nicht-Beamte'].forEach(function (st) {
        var kpf = snap.agg[g][st];
        if (!kpf) return;
        // gleichmäßige Streuung über [ytr-4 .. ytr+4]
        var lo = ytr - 4, hi = ytr + 4, buckets = [];
        for (var y = lo; y <= hi; y++) buckets.push(Math.max(0, Math.min(HORIZONT - 1, y)));
        var per = kpf / buckets.length;
        buckets.forEach(function (b) { byYear[b][st] += per; byYear[b].total += per; });
      });
    });
    byYear.forEach(function (r) {
      r.Beamte = Math.round(r.Beamte); r['Nicht-Beamte'] = Math.round(r['Nicht-Beamte']);
      r.total = r.Beamte + r['Nicht-Beamte'];
    });
    return byYear;
  }

  function statBox(label, value, sub) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + value + '</div><div class="stat-sub">' + (sub || '') + '</div></div>';
  }

  POL.viewRisiko = function () {
    var snap = snapshot();
    var proj = projektion(snap);
    var gesamt = GRUPPEN.reduce(function (a, g) { return a + snap.agg[g].total; }, 0);
    var ab55 = snap.agg['50–59'].total + snap.agg['≥60'].total;
    var next5 = proj.slice(0, 5).reduce(function (a, r) { return a + r.total; }, 0);

    var wrap = POL.el('div', 'view');
    var head = POL.el('div', 'view-head');
    head.innerHTML = '<h2>📉 Personalrisiko – Pensionierungs- & Altersabgangswelle</h2>' +
      '<p class="view-sub">Projektion auf Basis der aktuellen Altersstruktur (Stand ' +
      POL.monatLabel(snap.monat) + ', angenommenes Ruhestandsalter ' + RUHESTAND + ' Jahre).</p>';
    wrap.appendChild(head);

    var stats = POL.el('div', 'stat-row');
    stats.innerHTML =
      statBox('Beschäftigte', POL.fmt.int(gesamt), 'Köpfe gesamt') +
      statBox('Anteil ≥ 55 Jahre', POL.fmt.dec((ab55 / gesamt) * 100, 1) + ' %', POL.fmt.int(ab55) + ' Personen') +
      statBox('Abgänge in 5 Jahren', POL.fmt.int(next5), 'erwartete Pensionierungen') +
      statBox('Nachbesetzungsquote', POL.fmt.dec((next5 / gesamt) * 100, 1) + ' %', 'des heutigen Bestands');
    wrap.appendChild(stats);

    var p1 = POL.el('section', 'panel print-keep');
    p1.innerHTML = '<div class="panel-head"><h3>Erwartete Abgänge je Jahr (Beamte / Nicht-Beamte)</h3></div>' +
      '<div class="chart-box chart-box-lg"><canvas id="rkYear"></canvas></div>';
    wrap.appendChild(p1);

    var p2 = POL.el('section', 'panel print-keep');
    p2.innerHTML = '<div class="panel-head"><h3>Aktuelle Altersstruktur</h3></div>' +
      '<div class="brk-grid"><div class="chart-box"><canvas id="rkAge"></canvas></div>' +
      '<div class="brk-table-wrap"><table class="brk-table" id="rkTable"></table></div></div>';
    wrap.appendChild(p2);

    POL._afterRender = function () {
      // gestapelte Balken je Jahr
      POL.trackChart(new Chart(document.getElementById('rkYear').getContext('2d'), {
        type: 'bar',
        data: {
          labels: proj.map(function (r) { return r.jahr; }),
          datasets: [
            { label: 'Beamte', data: proj.map(function (r) { return r.Beamte; }), backgroundColor: '#1f6feb', borderRadius: 3 },
            { label: 'Nicht-Beamte', data: proj.map(function (r) { return r['Nicht-Beamte']; }), backgroundColor: '#b26a00', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' } } },
        },
      }));
      POL.barChart(document.getElementById('rkAge'), GRUPPEN,
        GRUPPEN.map(function (g) { return snap.agg[g].total; }), '#6f42c1', false);

      var cum = 0;
      document.getElementById('rkTable').innerHTML =
        '<thead><tr><th>Jahr</th><th class="num">Abgänge</th><th class="num">kumuliert</th></tr></thead><tbody>' +
        proj.map(function (r) {
          cum += r.total;
          return '<tr><td>' + r.jahr + '</td><td class="num">' + POL.fmt.int(r.total) +
            '</td><td class="num">' + POL.fmt.int(cum) + '</td></tr>';
        }).join('') + '</tbody>';
    };

    return wrap;
  };

})(window.POL);
