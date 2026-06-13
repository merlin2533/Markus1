/* cockpit.js – Lagebild/Startseite für die Gesamtübersicht (Präsidenten-Sicht).
   Ampel-Status je Bereich, Top-Abweichungen des Monats, Leit-Kennzahlen. */
(function (POL) {
  'use strict';

  var RANK = { rot: 3, gelb: 2, gruen: 1, neutral: 0 };

  // Abweichung relativ zum Ziel (für Ranking der Top-Abweichungen)
  function abweichung(kpi) {
    var z = POL.ziel(kpi); if (!z) return 0;
    var v = POL.current(kpi).value, ziel = Number(z.Zielwert) || 1;
    return Math.abs(v - ziel) / Math.abs(ziel);
  }

  function bereichStatus(bereichId) {
    var counts = { gruen: 0, gelb: 0, rot: 0 };
    POL.KPIS[bereichId].forEach(function (k) {
      var kpi = Object.assign({ bereich: bereichId }, k);
      var a = POL.ampel(kpi);
      if (counts[a] != null) counts[a]++;
    });
    var overall = counts.rot ? 'rot' : (counts.gelb ? 'gelb' : 'gruen');
    return { counts: counts, overall: overall };
  }

  POL.viewCockpit = function () {
    var wrap = POL.el('div', 'view');
    var stand = POL.monatLabel(POL.data.meta.stand);

    var head = POL.el('div', 'view-head');
    head.innerHTML = '<h2>🛡️ Lagebild – Gesamtübersicht</h2>' +
      '<p class="view-sub">' + POL.data.meta.organisation + ' · Stand: <strong>' + stand +
      '</strong> · Datenquelle: ' + POL.quelle + '</p>';
    wrap.appendChild(head);

    // ---- Status-Kacheln je Bereich ----
    var tiles = POL.el('div', 'status-tiles');
    POL.BEREICHE.forEach(function (b) {
      var st = bereichStatus(b.id);
      var tile = POL.el('a', 'status-tile status-' + st.overall);
      tile.href = '#/' + b.id;
      tile.innerHTML =
        '<div class="st-top">' + POL.ampelDot(st.overall) +
          '<span class="st-name">' + b.icon + ' ' + b.label + '</span></div>' +
        '<div class="st-counts">' +
          '<span class="st-c st-g">' + st.counts.gruen + ' im Plan</span>' +
          '<span class="st-c st-y">' + st.counts.gelb + ' Beob.</span>' +
          '<span class="st-c st-r">' + st.counts.rot + ' kritisch</span>' +
        '</div>';
      tiles.appendChild(tile);
    });
    wrap.appendChild(tiles);

    // ---- Top-Abweichungen des Monats ----
    var all = POL.allKpis().map(function (kpi) {
      return { kpi: kpi, ampel: POL.ampel(kpi), abw: abweichung(kpi) };
    }).filter(function (x) { return x.ampel === 'rot' || x.ampel === 'gelb'; });
    all.sort(function (a, b) {
      return (RANK[b.ampel] - RANK[a.ampel]) || (b.abw - a.abw);
    });

    var devPanel = POL.el('section', 'panel print-keep');
    var rows = all.slice(0, 8).map(function (x) {
      var kpi = x.kpi, cur = POL.current(kpi), z = POL.ziel(kpi), d = POL.delta(kpi);
      var meta = POL.bereichMeta(kpi.bereich);
      var deltaTxt = d ? '<span class="' + (d.gut === true ? 'good' : d.gut === false ? 'bad' : '') + '">' +
        (d.abs > 0 ? '▲' : d.abs < 0 ? '▼' : '▬') + ' ' + POL.fmt.signed(d.pct, 1) + ' %</span>' : '–';
      return '<tr onclick="location.hash=\'#/detail/' + kpi.bereich + '/' + kpi.id + '\'">' +
        '<td>' + POL.ampelDot(x.ampel) + '</td>' +
        '<td><span class="td-bereich" style="color:' + meta.farbe + '">' + meta.icon + '</span> ' + kpi.label + '</td>' +
        '<td class="num">' + POL.formatValue(kpi, cur.value) + '</td>' +
        '<td class="num muted">' + (z ? POL.formatValue(kpi, z.Zielwert) : '–') + '</td>' +
        '<td class="num">' + deltaTxt + '</td></tr>';
    }).join('');
    devPanel.innerHTML = '<div class="panel-head"><h3>⚠️ Top-Abweichungen des Monats</h3></div>' +
      '<table class="dev-table"><thead><tr><th></th><th>Kennzahl</th><th class="num">Aktuell</th>' +
      '<th class="num">Ziel</th><th class="num">Δ Vormonat</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="muted">Keine kritischen Abweichungen – alle Kennzahlen im Plan. ✅</td></tr>') +
      '</tbody></table><p class="hint no-print">Zeile anklicken öffnet die Detailseite.</p>';
    wrap.appendChild(devPanel);

    // ---- Leit-Kennzahlen quer über alle Bereiche ----
    var leitIds = [
      ['personal', 'personalstand'], ['personal', 'krankenstand'], ['personal', 'ueberstunden'],
      ['finanzen', 'budget'], ['finanzen', 'gesamtkosten'], ['fuhrpark', 'verfuegbarkeit'],
      ['einsatz', 'einsatzstunden'], ['personal', 'fluktuation'],
    ];
    var leit = leitIds.map(function (p) { return POL.kpi(p[0], p[1]); }).filter(Boolean);
    var sub = POL.el('div', 'view-head');
    sub.innerHTML = '<h3 class="cockpit-sub">Leit-Kennzahlen</h3>';
    wrap.appendChild(sub);
    var cg = POL.cardGrid(leit);
    wrap.appendChild(cg.grid);

    POL._afterRender = function () { POL.drawSparks(cg.queue); };
    return wrap;
  };

})(window.POL);
