/* views.js – Bereichs-Seiten (Personal, Finanzen, Fuhrpark, Einsatz). */
(function (POL) {
  'use strict';

  function viewHeader(title, sub) {
    var h = POL.el('div', 'view-head');
    h.innerHTML = '<h2>' + title + '</h2>' + (sub ? '<p class="view-sub">' + sub + '</p>' : '');
    return h;
  }

  var INTRO = {
    personal: 'Personalkennzahlen des Präsidiums Technik – jeweils aktueller Monat, Verlauf und Referenz Vormonat.',
    finanzen: 'Budget- und Kostenkennzahlen – Soll/Ist, Ausschöpfung und Verlauf.',
    fuhrpark: 'Fuhrpark und Ausstattung – Verfügbarkeit, Kosten und Bestand.',
    einsatz: 'Technische Einsätze, Unterstützung und Ausbildung.',
  };

  POL.viewBereich = function (bereichId) {
    var meta = POL.bereichMeta(bereichId);
    var kpis = POL.KPIS[bereichId].map(function (k) { return Object.assign({ bereich: bereichId }, k); });
    var wrap = POL.el('div', 'view');

    wrap.appendChild(viewHeader(meta.icon + ' ' + meta.label, INTRO[bereichId]));

    // Leit-Kennzahl als Verlauf (erste KPI des Bereichs)
    var lead = kpis[0];
    var panel = POL.el('section', 'panel print-keep');
    panel.innerHTML = '<div class="panel-head"><h3>Verlauf: ' + lead.label + '</h3>' +
      '<a class="panel-link no-print" href="#/detail/' + bereichId + '/' + lead.id + '">Detail →</a></div>' +
      '<div class="chart-box"><canvas></canvas></div>';
    wrap.appendChild(panel);

    var cg = POL.cardGrid(kpis);
    wrap.appendChild(cg.grid);

    // Finanzen: Budgetübersicht nach Referat (Drill-down)
    var budget = null;
    if (bereichId === 'finanzen' && POL.buildBudgetSection && (POL.data.bereiche.finanzen.budget || []).length) {
      budget = POL.buildBudgetSection();
      wrap.appendChild(budget.node);
    }

    // nach dem Einhängen zeichnen
    POL._afterRender = function () {
      var s = POL.series(lead);
      POL.lineChart(panel.querySelector('canvas'),
        s.map(function (p) { return POL.monatLabel(p.monat); }),
        [{ label: lead.label, data: s.map(function (p) { return p.value; }),
          borderColor: meta.farbe, backgroundColor: meta.farbe + '18', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }],
        { beginAtZero: lead.fmt !== 'percent' });
      POL.drawSparks(cg.queue);
      if (budget) budget.after();
    };

    return wrap;
  };

})(window.POL);
