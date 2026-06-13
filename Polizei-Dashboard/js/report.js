/* report.js – Management-Bericht für die Präsidialebene.
   Druck-/PDF-optimierte Gesamtansicht: Executive Summary, KPI-Tabellen je
   Bereich, Personalrisiko, editierbare Bewertungsfelder (in localStorage). */
(function (POL) {
  'use strict';

  function kommentar(bereich) {
    try { return localStorage.getItem('pol_bericht_' + bereich) || ''; } catch (e) { return ''; }
  }

  function kpiRow(kpi) {
    var cur = POL.current(kpi), d = POL.delta(kpi), yoy = POL.yoy(kpi), z = POL.ziel(kpi), st = POL.ampel(kpi);
    var dTxt = d ? (d.abs > 0 ? '▲' : d.abs < 0 ? '▼' : '▬') + ' ' + POL.fmt.signed(d.pct, 1) + ' %' : '–';
    var dCls = d ? (d.gut === true ? 'good' : d.gut === false ? 'bad' : '') : '';
    var yTxt = yoy && yoy.value ? POL.fmt.signed(((cur.value - yoy.value) / Math.abs(yoy.value)) * 100, 1) + ' %' : '–';
    return '<tr><td>' + POL.ampelDot(st) + ' ' + kpi.label + '</td>' +
      '<td class="num">' + POL.formatValue(kpi, cur.value) + '</td>' +
      '<td class="num ' + dCls + '">' + dTxt + '</td>' +
      '<td class="num">' + yTxt + '</td>' +
      '<td class="num">' + (z ? POL.formatValue(kpi, z.Zielwert) : '–') + '</td>' +
      '<td>' + POL.AMPEL_LABEL[st] + '</td></tr>';
  }

  function bereichBlock(b) {
    var kpis = POL.KPIS[b.id].map(function (k) { return Object.assign({ bereich: b.id }, k); });
    var counts = { gruen: 0, gelb: 0, rot: 0 };
    kpis.forEach(function (k) { var a = POL.ampel(k); if (counts[a] != null) counts[a]++; });
    return '<section class="rep-block print-keep"><h3 style="border-color:' + b.farbe + '">' +
      b.icon + ' ' + b.label + '</h3>' +
      '<div class="rep-status">Status: <span class="ampel-txt ampel-txt-' +
        (counts.rot ? 'rot' : counts.gelb ? 'gelb' : 'gruen') + '">' +
        counts.gruen + ' im Plan · ' + counts.gelb + ' Beobachtung · ' + counts.rot + ' kritisch</span></div>' +
      '<table class="rep-table"><thead><tr><th>Kennzahl</th><th class="num">Aktuell</th>' +
      '<th class="num">Δ Vormonat</th><th class="num">YoY</th><th class="num">Ziel</th><th>Bewertung</th></tr></thead>' +
      '<tbody>' + kpis.map(kpiRow).join('') + '</tbody></table>' +
      '<div class="rep-kommentar"><label>Bewertung / Maßnahmen (' + b.label + '):</label>' +
      '<textarea data-bereich="' + b.id + '" placeholder="Einschätzung der Präsidialebene …">' +
      kommentar(b.id).replace(/</g, '&lt;') + '</textarea></div></section>';
  }

  POL.viewBericht = function () {
    var wrap = POL.el('div', 'view report');
    var stand = POL.monatLabel(POL.data.meta.stand);

    // Top-Abweichungen
    var dev = POL.allKpis().map(function (kpi) { return { kpi: kpi, a: POL.ampel(kpi) }; })
      .filter(function (x) { return x.a === 'rot'; });

    wrap.innerHTML =
      '<div class="rep-cover print-keep">' +
        '<div class="rep-logo">🛡️ PTLS POL</div>' +
        '<h1>Management-Bericht</h1>' +
        '<p class="rep-org">' + POL.data.meta.organisation + '</p>' +
        '<p class="rep-stand">Berichtsstand: <strong>' + stand + '</strong> · erstellt am ' +
          new Date().toLocaleDateString('de-DE') + '</p>' +
        '<div class="rep-actions no-print">' +
          '<button class="btn btn-primary" id="repPdf">⬇️ Als PDF herunterladen</button>' +
          '<button class="btn" id="repPrint">🖨️ Drucken</button>' +
          '<span class="hint">Bewertungstexte werden lokal gespeichert.</span></div>' +
      '</div>' +
      '<section class="rep-block print-keep"><h3>Executive Summary</h3>' +
        '<p>Die nachfolgende Übersicht fasst die Kennzahlen des Präsidiums Technik zum Stand ' + stand +
        ' zusammen. ' + (dev.length ? '<strong>' + dev.length + '</strong> Kennzahl(en) sind als <em>kritisch</em> eingestuft und erfordern Aufmerksamkeit.' :
        'Alle Kennzahlen liegen aktuell im Plan.') + '</p>' +
        (dev.length ? '<ul class="rep-dev">' + dev.map(function (x) {
          return '<li>' + POL.ampelDot('rot') + ' ' + POL.bereichMeta(x.kpi.bereich).label + ' – ' +
            x.kpi.label + ': ' + POL.formatValue(x.kpi, POL.current(x.kpi).value) +
            ' (Ziel ' + POL.formatValue(x.kpi, POL.ziel(x.kpi).Zielwert) + ')</li>';
        }).join('') + '</ul>' : '') +
      '</section>' +
      POL.BEREICHE.map(bereichBlock).join('') +
      budgetBlock() +
      '<section class="rep-block print-keep"><h3>📉 Personalrisiko</h3>' +
        '<p>' + personalrisikoText() + '</p></section>' +
      '<p class="rep-foot">Demodaten – nicht zur dienstlichen Verwendung. Erstellt mit dem PTLS POL Dashboard.</p>';

    POL._afterRender = function () {
      document.getElementById('repPrint').addEventListener('click', function () { window.print(); });
      document.getElementById('repPdf').addEventListener('click', function () {
        POL.pdf(wrap, 'PTLS-POL_Management-Bericht_' + POL.data.meta.stand + '.pdf', 'portrait');
      });
      wrap.querySelectorAll('textarea[data-bereich]').forEach(function (ta) {
        ta.addEventListener('input', function () {
          try { localStorage.setItem('pol_bericht_' + ta.getAttribute('data-bereich'), ta.value); } catch (e) {}
        });
      });
    };
    return wrap;
  };

  function budgetBlock() {
    var rows = POL.data.bereiche.finanzen.budget || [];
    if (!rows.length) return '';
    var jahr = (POL.data.meta.stand || '').split('-')[0];
    var agg = {}, order = [], ges = { Plan: 0, Ist: 0, Abgerechnet: 0 };
    rows.forEach(function (r) {
      if (String(r.Monat).indexOf(jahr) !== 0) return;
      if (!agg[r.Referat]) { agg[r.Referat] = { Plan: 0, Ist: 0, Abgerechnet: 0 }; order.push(r.Referat); }
      agg[r.Referat].Plan += r.Plan; agg[r.Referat].Ist += r.Ist; agg[r.Referat].Abgerechnet += r.Abgerechnet;
      ges.Plan += r.Plan; ges.Ist += r.Ist; ges.Abgerechnet += r.Abgerechnet;
    });
    var body = order.map(function (k) {
      var o = agg[k], verf = o.Plan - o.Ist, aus = o.Plan ? (o.Ist / o.Plan) * 100 : 0;
      return '<tr><td>' + POL.ampelDot(POL.budgetAmpel(aus)) + ' ' + k + '</td>' +
        '<td class="num">' + POL.fmt.eur(o.Plan) + '</td><td class="num">' + POL.fmt.eur(o.Ist) + '</td>' +
        '<td class="num">' + POL.fmt.eur(o.Abgerechnet) + '</td>' +
        '<td class="num ' + (verf < 0 ? 'bad' : 'good') + '">' + POL.fmt.eur(verf) + '</td>' +
        '<td class="num">' + POL.fmt.dec(aus, 1) + ' %</td></tr>';
    }).join('');
    var verfG = ges.Plan - ges.Ist, ausG = ges.Plan ? (ges.Ist / ges.Plan) * 100 : 0;
    return '<section class="rep-block print-keep"><h3>💰 Budget nach Referat (' + jahr + ', kumuliert)</h3>' +
      '<table class="rep-table"><thead><tr><th>Referat</th><th class="num">Plan</th><th class="num">Ist</th>' +
      '<th class="num">Abgerechnet</th><th class="num">Verfügbar</th><th class="num">Ausschöpf.</th></tr></thead>' +
      '<tbody>' + body +
      '<tr class="rep-sum"><td><strong>Gesamt</strong></td><td class="num"><strong>' + POL.fmt.eur(ges.Plan) +
      '</strong></td><td class="num"><strong>' + POL.fmt.eur(ges.Ist) + '</strong></td>' +
      '<td class="num"><strong>' + POL.fmt.eur(ges.Abgerechnet) + '</strong></td>' +
      '<td class="num ' + (verfG < 0 ? 'bad' : 'good') + '"><strong>' + POL.fmt.eur(verfG) + '</strong></td>' +
      '<td class="num"><strong>' + POL.fmt.dec(ausG, 1) + ' %</strong></td></tr>' +
      '</tbody></table></section>';
  }

  function personalrisikoText() {
    var monat = POL.data.meta.stand;
    var fakten = POL.data.bereiche.personal.fakten;
    var ab55 = 0, gesamt = 0;
    fakten.forEach(function (r) {
      if (r.Monat !== monat) return;
      gesamt += r.Personalstand;
      if (r.Altersgruppe === '50–59' || r.Altersgruppe === '≥60') ab55 += r.Personalstand;
    });
    var quote = gesamt ? (ab55 / gesamt) * 100 : 0;
    return 'Aktuell sind <strong>' + POL.fmt.dec(quote, 1) + ' %</strong> der Beschäftigten 55 Jahre oder älter (' +
      POL.fmt.int(ab55) + ' von ' + POL.fmt.int(gesamt) + '). In den kommenden Jahren ist mit einer spürbaren ' +
      'Pensionierungs-/Abgangswelle zu rechnen; rechtzeitige Nachbesetzung und Wissenssicherung sind einzuplanen. ' +
      'Details siehe Ansicht „Personalrisiko".';
  }

})(window.POL);
