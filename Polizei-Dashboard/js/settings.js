/* settings.js – Einstellungsmenü für Schwellwerte (Ampel-Zielwerte je Kennzahl
   und Budget-Schwellwerte). Speichert Overrides in localStorage. */
(function (POL) {
  'use strict';

  var RICHTUNGEN = [
    { v: 'hoch', t: 'höher = besser' },
    { v: 'niedrig', t: 'niedriger = besser' },
    { v: 'neutral', t: 'nah am Ziel' },
  ];

  function richtungSelect(sel) {
    return '<select class="set-richtung">' + RICHTUNGEN.map(function (r) {
      return '<option value="' + r.v + '"' + (r.v === sel ? ' selected' : '') + '>' + r.t + '</option>';
    }).join('') + '</select>';
  }

  POL.viewEinstellungen = function () {
    var wrap = POL.el('div', 'view');
    var head = POL.el('div', 'view-head');
    head.innerHTML = '<h2>⚙️ Einstellungen – Schwellwerte</h2>' +
      '<p class="view-sub">Zielwerte, Richtung und Toleranz steuern die Ampelfarben ' +
      '(grün = im Plan, gelb innerhalb der Toleranz, rot darüber hinaus). ' +
      'Änderungen werden lokal in diesem Browser gespeichert.</p>';
    wrap.appendChild(head);

    // Datenquelle & Excel (Download / Export / Import)
    var dataPanel = POL.el('section', 'panel');
    var bereiche = ['personal', 'finanzen', 'fuhrpark', 'einsatz'];
    var dlRows = bereiche.map(function (id) {
      var m = POL.bereichMeta(id);
      return '<tr><td>' + m.icon + ' ' + m.label + '</td>' +
        '<td><a class="dl-link" href="daten/' + id + '.xlsx" download>⬇️ Vorlage (daten/' + id + '.xlsx)</a></td>' +
        '<td><button class="btn btn-sm data-export" data-bereich="' + id + '">Aktuelle Daten exportieren</button></td></tr>';
    }).join('');
    dataPanel.innerHTML = '<div class="panel-head"><h3>🔗 Datenquelle &amp; Excel-Integration</h3></div>' +
      '<p class="hint">Quelle aktuell: <strong>' + POL.quelle + '</strong>. ' +
      'Excel herunterladen, in Excel bearbeiten und über „Excel-Import" (oben rechts) wieder einlesen ' +
      '(Dateiname muss den Bereich enthalten). Die Vorlagen-Links funktionieren beim Betrieb über einen ' +
      'lokalen Server.</p>' +
      '<table class="set-table"><thead><tr><th>Bereich</th><th>Vorlage / Quelle</th><th>Export</th></tr></thead>' +
      '<tbody>' + dlRows + '</tbody></table>';
    wrap.appendChild(dataPanel);

    // Budget-Schwellwerte
    var budgetPanel = POL.el('section', 'panel');
    budgetPanel.innerHTML = '<div class="panel-head"><h3>💰 Budget-Ausschöpfung (Ampel)</h3></div>' +
      '<div class="set-budget">' +
      '<label>Warnung ab (gelb) <input type="number" id="setBudgetWarn" step="1" value="' + (POL.cfg.budgetWarn) + '"> %</label>' +
      '<label>Kritisch ab (rot) <input type="number" id="setBudgetKrit" step="1" value="' + (POL.cfg.budgetKrit) + '"> %</label>' +
      '</div><p class="hint">Bezogen auf Ist / Plan je Referat und Budgetelement.</p>';
    wrap.appendChild(budgetPanel);

    // KPI-Schwellwerte je Bereich
    POL.BEREICHE.forEach(function (b) {
      var panel = POL.el('section', 'panel');
      var rows = POL.KPIS[b.id].map(function (kp) {
        var kpi = Object.assign({ bereich: b.id }, kp);
        var z = POL.ziel(kpi) || { Zielwert: '', Richtung: 'neutral', Toleranz: 10 };
        return '<tr data-bereich="' + b.id + '" data-key="' + kpi.key + '">' +
          '<td>' + kpi.label + ' <span class="muted">(' + (kpi.unit || '') + ')</span></td>' +
          '<td class="num"><input type="number" class="set-ziel" step="any" value="' + z.Zielwert + '"></td>' +
          '<td>' + richtungSelect(z.Richtung) + '</td>' +
          '<td class="num"><input type="number" class="set-tol" step="1" value="' + z.Toleranz + '"> %</td>' +
          '</tr>';
      }).join('');
      panel.innerHTML = '<div class="panel-head"><h3>' + b.icon + ' ' + b.label + '</h3></div>' +
        '<table class="set-table set-thresholds"><thead><tr><th>Kennzahl</th><th class="num">Zielwert</th>' +
        '<th>Richtung</th><th class="num">Toleranz</th></tr></thead><tbody>' + rows + '</tbody></table>';
      wrap.appendChild(panel);
    });

    var actions = POL.el('div', 'set-actions');
    actions.innerHTML = '<button class="btn btn-primary" id="setSave">Speichern</button>' +
      '<button class="btn btn-ghost" id="setReset">Auf Standard zurücksetzen</button>' +
      '<span class="set-msg" id="setMsg"></span>';
    wrap.appendChild(actions);

    POL._afterRender = function () {
      document.getElementById('setSave').addEventListener('click', function () {
        var ov = {};
        wrap.querySelectorAll('.set-thresholds tbody tr').forEach(function (tr) {
          var key = tr.getAttribute('data-bereich') + '.' + tr.getAttribute('data-key');
          ov[key] = {
            Zielwert: parseFloat(tr.querySelector('.set-ziel').value),
            Richtung: tr.querySelector('.set-richtung').value,
            Toleranz: parseFloat(tr.querySelector('.set-tol').value),
          };
        });
        POL.overrides = ov; POL.saveOverrides();
        POL.cfg.budgetWarn = parseFloat(document.getElementById('setBudgetWarn').value);
        POL.cfg.budgetKrit = parseFloat(document.getElementById('setBudgetKrit').value);
        POL.saveCfg();
        var msg = document.getElementById('setMsg');
        msg.textContent = '✓ Gespeichert – Ampeln aktualisiert.'; msg.className = 'set-msg good';
      });
      document.getElementById('setReset').addEventListener('click', function () {
        POL.resetSettings();
        POL.route(); // neu rendern mit Standardwerten
      });
      wrap.querySelectorAll('.data-export').forEach(function (btn) {
        btn.addEventListener('click', function () { POL.exportBereich(btn.getAttribute('data-bereich')); });
      });
    };

    return wrap;
  };

})(window.POL);
