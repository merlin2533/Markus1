/* cards.js – rendert eine KPI-Karte: Aktuellwert, Δ Vormonat, Ampel, Sparkline,
   Link auf die Detailseite. */
(function (POL) {
  'use strict';

  POL.ampelDot = function (status) {
    return '<span class="ampel ampel-' + status + '" title="' + POL.AMPEL_LABEL[status] + '"></span>';
  };

  // erzeugt ein Karten-Element; sparklines werden gesammelt und nach dem Einhängen gezeichnet
  POL.renderCard = function (kpi, sparkQueue) {
    var cur = POL.current(kpi);
    var delta = POL.delta(kpi);
    var status = POL.ampel(kpi);
    var meta = POL.bereichMeta(kpi.bereich);
    var z = POL.ziel(kpi);

    var card = POL.el('a', 'kpi-card');
    card.href = '#/detail/' + kpi.bereich + '/' + kpi.id;

    var deltaHtml = '';
    if (delta) {
      var arrow = delta.abs > 0 ? '▲' : (delta.abs < 0 ? '▼' : '▬');
      var cls = delta.gut === true ? 'good' : (delta.gut === false ? 'bad' : 'neutral');
      deltaHtml = '<span class="kpi-delta ' + cls + '">' + arrow + ' ' +
        POL.fmt.signed(delta.pct, 1) + ' %</span>' +
        '<span class="kpi-delta-sub">ggü. Vormonat</span>';
    }

    var zielHtml = z ? '<div class="kpi-ziel">Ziel: ' + POL.formatValue(kpi, z.Zielwert) +
      ' · <span class="ampel-txt ampel-txt-' + status + '">' + POL.AMPEL_LABEL[status] + '</span></div>' : '';

    card.innerHTML =
      '<div class="kpi-top">' +
        '<span class="kpi-title">' + kpi.label + '</span>' + POL.ampelDot(status) +
      '</div>' +
      '<div class="kpi-value">' + POL.formatValue(kpi, cur.value) + '</div>' +
      '<div class="kpi-delta-row">' + deltaHtml + '</div>' +
      '<div class="kpi-spark"><canvas></canvas></div>' +
      zielHtml +
      '<div class="kpi-foot"><span class="kpi-bereich" style="color:' + meta.farbe + '">' +
        meta.icon + ' ' + meta.label + '</span><span class="kpi-link">Details →</span></div>';

    if (sparkQueue) {
      sparkQueue.push({ canvas: card.querySelector('canvas'), kpi: kpi, farbe: meta.farbe });
    }
    return card;
  };

  // zeichnet alle gesammelten Sparklines (nach dem DOM-Einhängen)
  POL.drawSparks = function (queue) {
    queue.forEach(function (q) {
      var vals = POL.series(q.kpi).map(function (p) { return p.value; });
      POL.sparkline(q.canvas, vals, q.farbe);
    });
  };

  // Grid aus mehreren Karten
  POL.cardGrid = function (kpis) {
    var grid = POL.el('div', 'kpi-grid');
    var queue = [];
    kpis.forEach(function (kpi) { grid.appendChild(POL.renderCard(kpi, queue)); });
    return { grid: grid, queue: queue };
  };

})(window.POL);
