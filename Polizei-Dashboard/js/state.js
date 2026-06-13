/* state.js – zentraler Namespace, Datenspeicher und Formatierungs-Helfer.
   Alle Module hängen sich an window.POL. */
(function () {
  'use strict';

  var POL = window.POL || (window.POL = {});

  // Datenmodell wird von data.js befüllt: { meta, bereiche:{ personal, finanzen, fuhrpark, einsatz } }
  POL.data = null;
  POL.quelle = '–'; // "Excel-Dateien" oder "Eingebettete Demodaten"

  POL.BEREICHE = [
    { id: 'personal', label: 'Personal', icon: '👮', farbe: '#1f6feb' },
    { id: 'finanzen', label: 'Finanzen', icon: '💶', farbe: '#2e7d32' },
    { id: 'fuhrpark', label: 'Fuhrpark & Ausstattung', icon: '🚓', farbe: '#b26a00' },
    { id: 'einsatz', label: 'Einsatz & Ausbildung', icon: '🎯', farbe: '#6f42c1' },
  ];
  POL.bereichMeta = function (id) {
    return POL.BEREICHE.filter(function (b) { return b.id === id; })[0] || POL.BEREICHE[0];
  };

  /* ---- Monats-Helfer ---- */
  POL.monate = function () { return (POL.data && POL.data.meta.monate) || []; };
  POL.monatLabel = function (key) {
    if (!key) return '';
    var M = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    var p = key.split('-');
    return M[parseInt(p[1], 10) - 1] + ' ' + p[0];
  };

  /* ---- Zahlen-Formatierung (de-DE) ---- */
  var nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  function nfd(d) { return new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); }

  POL.fmt = {
    int: function (v) { return nf0.format(Math.round(v || 0)); },
    dec: function (v, d) { return nfd(d == null ? 1 : d).format(v || 0); },
    pct: function (v, d) { return nfd(d == null ? 1 : d).format(v || 0) + ' %'; },
    eur: function (v) {
      v = v || 0; var a = Math.abs(v);
      if (a >= 1e6) return nfd(2).format(v / 1e6) + ' Mio €';
      if (a >= 1e4) return nf0.format(Math.round(v / 1000)) + ' Tsd €';
      return nf0.format(Math.round(v)) + ' €';
    },
    eurFull: function (v) { return nf0.format(Math.round(v || 0)) + ' €'; },
    signed: function (v, d) {
      var s = v > 0 ? '+' : (v < 0 ? '−' : '±');
      return s + nfd(d == null ? 1 : d).format(Math.abs(v || 0));
    },
  };

  // Wert einer Kennzahl gemäß ihrer Definition formatieren
  POL.formatValue = function (kpi, v) {
    if (v == null || isNaN(v)) return '–';
    var d = kpi.decimals == null ? 0 : kpi.decimals;
    switch (kpi.fmt) {
      case 'currency': return POL.fmt.eur(v);
      case 'currencyFull': return POL.fmt.eurFull(v);
      case 'percent': return POL.fmt.dec(v, d) + ' %';
      case 'integer': return POL.fmt.int(v) + (kpi.unit ? ' ' + kpi.unit : '');
      case 'decimal': return POL.fmt.dec(v, d) + (kpi.unit ? ' ' + kpi.unit : '');
      default: return POL.fmt.int(v);
    }
  };

  POL.el = function (tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
})();
