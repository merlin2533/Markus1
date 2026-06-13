/* print.js – Druckfunktion (aktuelle Ansicht bzw. Management-Bericht). */
(function (POL) {
  'use strict';

  POL.print = function () { window.print(); };

  POL.initPrint = function () {
    var btn = document.getElementById('printBtn');
    if (btn) btn.addEventListener('click', POL.print);
    var rep = document.getElementById('reportBtn');
    if (rep) rep.addEventListener('click', function () { location.hash = '#/bericht'; });
  };

})(window.POL);
