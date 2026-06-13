/* budget.js – Budgetübersicht nach Referat × Budgetelement (Finanzen).
   Plan / Ist / Abgerechnet / Verfügbar mit aufklappbarem Drill-down und
   Monatsverlauf je Budgetelement. */
(function (POL) {
  'use strict';

  function budgetRows() { return (POL.data.bereiche.finanzen.budget) || []; }
  function currentYear() { return (POL.data.meta.stand || '2026-01').split('-')[0]; }

  // Ampel der Budgetausschöpfung (Ist/Plan): konfigurierbar über Einstellungen
  POL.budgetAmpel = function (ausschoepfung) {
    var warn = Number(POL.cfg.budgetWarn) || 90, krit = Number(POL.cfg.budgetKrit) || 100;
    if (ausschoepfung > krit) return 'rot';
    if (ausschoepfung > warn) return 'gelb';
    return 'gruen';
  };

  // YTD-Aggregation des laufenden Jahres als Baum Referat -> Budgetelemente
  function aggregate() {
    var jahr = currentYear();
    var rows = budgetRows().filter(function (r) { return String(r.Monat).indexOf(jahr) === 0; });
    var tree = {}; var order = [];
    rows.forEach(function (r) {
      if (!tree[r.Referat]) { tree[r.Referat] = { name: r.Referat, Plan: 0, Ist: 0, Abgerechnet: 0, kinder: {}, korder: [] }; order.push(r.Referat); }
      var ref = tree[r.Referat];
      ref.Plan += r.Plan; ref.Ist += r.Ist; ref.Abgerechnet += r.Abgerechnet;
      if (!ref.kinder[r.Budgetelement]) { ref.kinder[r.Budgetelement] = { name: r.Budgetelement, Plan: 0, Ist: 0, Abgerechnet: 0 }; ref.korder.push(r.Budgetelement); }
      var ch = ref.kinder[r.Budgetelement];
      ch.Plan += r.Plan; ch.Ist += r.Ist; ch.Abgerechnet += r.Abgerechnet;
    });
    return { jahr: jahr, order: order, tree: tree };
  }

  function metricsCells(o) {
    var verf = o.Plan - o.Ist;
    var aus = o.Plan ? (o.Ist / o.Plan) * 100 : 0;
    var st = POL.budgetAmpel(aus);
    return '<td class="num">' + POL.fmt.eur(o.Plan) + '</td>' +
      '<td class="num">' + POL.fmt.eur(o.Ist) + '</td>' +
      '<td class="num">' + POL.fmt.eur(o.Abgerechnet) + '</td>' +
      '<td class="num ' + (verf < 0 ? 'bad' : 'good') + '">' + POL.fmt.eur(verf) + '</td>' +
      '<td class="num">' + POL.fmt.dec(aus, 1) + ' %</td>' +
      '<td>' + POL.ampelDot(st) + '</td>';
  }

  POL.buildBudgetSection = function () {
    var agg = aggregate();
    var ges = { Plan: 0, Ist: 0, Abgerechnet: 0 };
    agg.order.forEach(function (k) { var r = agg.tree[k]; ges.Plan += r.Plan; ges.Ist += r.Ist; ges.Abgerechnet += r.Abgerechnet; });
    var verfGes = ges.Plan - ges.Ist, ausGes = ges.Plan ? (ges.Ist / ges.Plan) * 100 : 0;

    var sec = POL.el('section', 'panel print-keep budget-panel');

    // Kopf + Summenkacheln
    var head = '<div class="panel-head"><h3>💰 Budgetübersicht nach Referat (' + agg.jahr + ', kumuliert)</h3>' +
      '<span class="hint no-print">Zeile aufklappen ▶ · Budgetelement anklicken für Verlauf</span></div>';
    var sum = '<div class="budget-sum">' +
      sumBox('Plan (verfügbar)', POL.fmt.eur(ges.Plan)) +
      sumBox('Ist (verbraucht)', POL.fmt.eur(ges.Ist)) +
      sumBox('Abgerechnet', POL.fmt.eur(ges.Abgerechnet)) +
      sumBox('Budget zur Verfügung', POL.fmt.eur(verfGes), verfGes < 0 ? 'bad' : 'good') +
      sumBox('Ausschöpfung', POL.fmt.dec(ausGes, 1) + ' %') + '</div>';

    // Baum-Tabelle
    var trows = '';
    agg.order.forEach(function (refName, ri) {
      var ref = agg.tree[refName];
      trows += '<tr class="brow brow-parent" data-ref="' + ri + '">' +
        '<td class="bcell-name"><span class="btoggle">▶</span> <strong>' + ref.name + '</strong></td>' +
        metricsCells(ref) + '</tr>';
      ref.korder.forEach(function (chName) {
        var ch = ref.kinder[chName];
        trows += '<tr class="brow brow-child child-of-' + ri + '" data-ref="' + ri + '" ' +
          'data-referat="' + ref.name + '" data-element="' + ch.name + '" style="display:none">' +
          '<td class="bcell-name bcell-child">↳ ' + ch.name + '</td>' + metricsCells(ch) + '</tr>';
      });
    });

    var table = '<div class="table-wrap"><table class="budget-table">' +
      '<thead><tr><th>Referat / Budgetelement</th><th class="num">Plan</th><th class="num">Ist</th>' +
      '<th class="num">Abgerechnet</th><th class="num">Verfügbar</th><th class="num">Ausschöpf.</th><th></th></tr></thead>' +
      '<tbody>' + trows + '</tbody></table></div>';

    // Drill-down-Diagramm
    var drill = '<div class="budget-drill"><div class="panel-head"><h4 id="bdTitle">Verlauf: ' +
      'Budgetelement auswählen</h4></div><div class="chart-box"><canvas id="bdChart"></canvas></div></div>';

    sec.innerHTML = head + sum +
      '<div class="budget-grid"><div class="chart-box budget-overview"><canvas id="bdOverview"></canvas></div>' +
      table + '</div>' + drill;

    function after() {
      // Übersichts-Balken: Plan/Ist/Abgerechnet je Referat
      POL.trackChart(new Chart(document.getElementById('bdOverview').getContext('2d'), {
        type: 'bar',
        data: {
          labels: agg.order,
          datasets: [
            { label: 'Plan', data: agg.order.map(function (k) { return agg.tree[k].Plan; }), backgroundColor: '#9aa7bd', borderRadius: 3 },
            { label: 'Ist', data: agg.order.map(function (k) { return agg.tree[k].Ist; }), backgroundColor: '#2e7d32', borderRadius: 3 },
            { label: 'Abgerechnet', data: agg.order.map(function (k) { return agg.tree[k].Abgerechnet; }), backgroundColor: '#b26a00', borderRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' }, title: { display: true, text: 'Plan / Ist / Abgerechnet je Referat (' + agg.jahr + ')' } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.06)' }, ticks: { callback: function (v) { return POL.fmt.eur(v); } } } },
        },
      }));

      // Auf-/Zuklappen der Referate
      sec.querySelectorAll('.brow-parent').forEach(function (tr) {
        tr.addEventListener('click', function () {
          var ri = tr.getAttribute('data-ref');
          var open = tr.classList.toggle('open');
          tr.querySelector('.btoggle').textContent = open ? '▼' : '▶';
          sec.querySelectorAll('.child-of-' + ri).forEach(function (c) { c.style.display = open ? '' : 'none'; });
        });
      });
      // Drill auf Budgetelement
      sec.querySelectorAll('.brow-child').forEach(function (tr) {
        tr.addEventListener('click', function (e) {
          e.stopPropagation();
          drawDrill(tr.getAttribute('data-referat'), tr.getAttribute('data-element'));
          sec.querySelectorAll('.brow-child').forEach(function (c) { c.classList.remove('sel'); });
          tr.classList.add('sel');
        });
      });
      // Initial: erstes Referat aufklappen + erstes Element zeigen
      var first = sec.querySelector('.brow-parent');
      if (first) first.click();
      var firstRef = agg.order[0];
      if (firstRef) drawDrill(firstRef, agg.tree[firstRef].korder[0]);
    }

    function drawDrill(referat, element) {
      document.getElementById('bdTitle').textContent = 'Verlauf: ' + referat + ' · ' + element;
      var rows = budgetRows().filter(function (r) { return r.Referat === referat && r.Budgetelement === element; });
      var labels = rows.map(function (r) { return POL.monatLabel(r.Monat); });
      POL.lineChart(document.getElementById('bdChart'), labels, [
        { label: 'Plan', data: rows.map(function (r) { return r.Plan; }), borderColor: '#9aa7bd', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
        { label: 'Ist', data: rows.map(function (r) { return r.Ist; }), borderColor: '#2e7d32', backgroundColor: '#2e7d3214', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true },
        { label: 'Abgerechnet', data: rows.map(function (r) { return r.Abgerechnet; }), borderColor: '#b26a00', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
      ], { beginAtZero: true });
    }

    return { node: sec, after: after };
  };

  function sumBox(label, value, cls) {
    return '<div class="bsum ' + (cls || '') + '"><div class="bsum-label">' + label + '</div>' +
      '<div class="bsum-value">' + value + '</div></div>';
  }

})(window.POL);
