/* data.js – lädt die Bereichs-Excel automatisch (fetch + SheetJS).
   Fällt bei file://-Aufruf bzw. Fehlern auf window.POL_FALLBACK zurück. */
(function (POL) {
  'use strict';

  var FILES = { personal: 'personal', finanzen: 'finanzen', fuhrpark: 'fuhrpark', einsatz: 'einsatz' };

  function parseWorkbook(wb) {
    function sheet(name) {
      var s = wb.Sheets[name];
      return s ? XLSX.utils.sheet_to_json(s, { defval: null }) : [];
    }
    var out = { ziele: sheet('Ziele'), zeitreihe: sheet('Zeitreihe'), fakten: sheet('Fakten') };
    if (wb.Sheets['Budget']) out.budget = sheet('Budget'); // nur Finanzen
    return out;
  }

  function loadXlsx(name) {
    return fetch('daten/' + name + '.xlsx').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      return parseWorkbook(wb);
    });
  }

  function buildMeta(bereiche) {
    var monate = (bereiche.personal.zeitreihe || []).map(function (r) { return r.Monat; });
    var abt = {};
    (bereiche.personal.fakten || []).forEach(function (r) { abt[r.Abteilung] = 1; });
    return {
      organisation: 'PTLS POL – Präsidium Technik, Logistik und Service der Polizei',
      stand: monate[monate.length - 1] || '',
      monate: monate,
      abteilungen: Object.keys(abt),
    };
  }

  // Lädt zuerst aus Excel; bei Fehler eingebettete Demodaten.
  POL.loadData = function () {
    if (typeof XLSX === 'undefined') {
      return useFallback('SheetJS nicht geladen');
    }
    var keys = Object.keys(FILES);
    return Promise.all(keys.map(function (k) { return loadXlsx(FILES[k]); }))
      .then(function (results) {
        var bereiche = {};
        keys.forEach(function (k, i) { bereiche[k] = results[i]; });
        POL.data = { meta: buildMeta(bereiche), bereiche: bereiche };
        POL.quelle = 'Excel-Dateien (daten/*.xlsx)';
        return POL.data;
      })
      .catch(function (err) { return useFallback(err && err.message); });
  };

  function useFallback(grund) {
    if (window.POL_FALLBACK) {
      POL.data = window.POL_FALLBACK;
      POL.quelle = 'Eingebettete Demodaten';
      POL.fallbackGrund = grund || '';
      return Promise.resolve(POL.data);
    }
    return Promise.reject(new Error('Keine Daten verfügbar (' + grund + ')'));
  }

  // Exportiert die aktuell geladenen Daten eines Bereichs als Excel (Round-Trip:
  // herunterladen -> bearbeiten -> wieder importieren). Funktioniert auch offline.
  POL.exportBereich = function (bereich) {
    if (typeof XLSX === 'undefined') { alert('SheetJS nicht verfügbar.'); return; }
    var b = POL.data.bereiche[bereich];
    if (!b) return;
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.ziele || []), 'Ziele');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.zeitreihe || []), 'Zeitreihe');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.fakten || []), 'Fakten');
    if (b.budget) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b.budget), 'Budget');
    XLSX.writeFile(wb, bereich + '_' + (POL.data.meta.stand || '') + '.xlsx');
  };

  // Optionaler manueller Import einer Bereichs-Excel über den Topbar-Button.
  POL.importFile = function (bereich, file, done) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        POL.data.bereiche[bereich] = parseWorkbook(wb);
        POL.data.meta = buildMeta(POL.data.bereiche);
        done(null);
      } catch (err) { done(err); }
    };
    reader.onerror = function () { done(new Error('Datei nicht lesbar')); };
    reader.readAsArrayBuffer(file);
  };

})(window.POL);
