/* print.js – Drucken (Druckdialog) und direkter HTML→PDF-Export (html2pdf). */
(function (POL) {
  'use strict';

  POL.print = function () { window.print(); };

  // Direkter PDF-Download der angegebenen Ansicht ohne Druckdialog.
  POL.pdf = function (el, filename, orientation) {
    el = el || document.getElementById('content');
    if (typeof window.html2pdf === 'undefined') {
      alert('PDF-Export nicht verfügbar (html2pdf nicht geladen) – bitte „Drucken" und „Als PDF speichern" nutzen.');
      window.print();
      return;
    }
    var btns = document.querySelectorAll('.no-print');
    btns.forEach(function (b) { b.dataset._d = b.style.display; b.style.display = 'none'; });
    window.html2pdf().set({
      margin: [8, 8, 10, 8],
      filename: filename || ('ptls-pol_' + new Date().toISOString().slice(0, 10) + '.pdf'),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: orientation || 'landscape' },
      pagebreak: { mode: ['css', 'avoid-all'] },
    }).from(el).save().then(function () {
      btns.forEach(function (b) { b.style.display = b.dataset._d || ''; });
    }).catch(function () {
      btns.forEach(function (b) { b.style.display = b.dataset._d || ''; });
    });
  };

  POL.initPrint = function () {
    var btn = document.getElementById('printBtn');
    if (btn) btn.addEventListener('click', POL.print);
    var pdf = document.getElementById('pdfBtn');
    if (pdf) pdf.addEventListener('click', function () {
      var title = (document.getElementById('currentTitle').textContent || 'ansicht')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-');
      POL.pdf(document.getElementById('content'), 'ptls-pol_' + title + '.pdf', 'landscape');
    });
    var rep = document.getElementById('reportBtn');
    if (rep) rep.addEventListener('click', function () { location.hash = '#/bericht'; });
  };

})(window.POL);
