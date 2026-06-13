/* app.js – Bootstrap: Daten laden, Banner setzen, Import-Button, Router starten. */
(function (POL) {
  'use strict';

  function setStatus() {
    var el = document.getElementById('dataStatus');
    if (!el) return;
    el.textContent = 'Datenquelle: ' + POL.quelle + ' · Stand ' + POL.monatLabel(POL.data.meta.stand);
    var banner = document.getElementById('fallbackBanner');
    if (banner) {
      var isFallback = POL.quelle.indexOf('Eingebettet') >= 0;
      banner.style.display = isFallback ? 'block' : 'none';
    }
  }

  function initImport() {
    var input = document.getElementById('importInput');
    if (!input) return;
    input.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      // Bereich aus Dateinamen ableiten (personal/finanzen/fuhrpark/einsatz)
      var name = file.name.toLowerCase();
      var bereich = ['personal', 'finanzen', 'fuhrpark', 'einsatz'].filter(function (b) {
        return name.indexOf(b) >= 0;
      })[0];
      if (!bereich) { alert('Dateiname muss den Bereich enthalten (personal/finanzen/fuhrpark/einsatz).'); return; }
      POL.importFile(bereich, file, function (err) {
        if (err) { alert('Import fehlgeschlagen: ' + err.message); return; }
        setStatus();
        POL.route();
        alert('Bereich „' + bereich + '" aus „' + file.name + '" geladen.');
      });
      input.value = '';
    });
  }

  function boot() {
    POL.loadData().then(function () {
      setStatus();
      initImport();
      POL.initPrint();
      POL.initRouter();
    }).catch(function (err) {
      document.getElementById('content').innerHTML =
        '<div class="panel"><h2>Fehler beim Laden der Daten</h2><p>' + (err && err.message) +
        '</p><p class="hint">Bitte das Dashboard über einen lokalen Server starten ' +
        '(z. B. <code>python3 -m http.server</code>) oder <code>js/fallback-data.js</code> erzeugen ' +
        '(<code>node tools/generate-data.js</code>).</p></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.POL);
