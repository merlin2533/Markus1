/* App-Initialisierung und Verdrahtung der Toolbar. */
(function (PT) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    PT.load();

    PT.initTable();
    PT.initCharts();
    PT.initProcess();
    PT.initHeatmap();

    /* refreshDerivedViews: alles, was sich aus Werten ohne Tabellen-Re-Render ergibt */
    PT.refreshDerivedViews = function () {
      PT.renderCharts();
      PT.renderHeatmap();
    };

    /* Voll-Re-Render bei Strukturänderungen */
    PT.subscribe(function () {
      PT.renderTable();
      PT.renderCharts();
      PT.renderProcess();
      PT.renderHeatmap();
    });

    bindToolbar();

    // Initiales Rendern
    PT.renderTable();
    PT.renderCharts();
    PT.renderProcess();
    PT.renderHeatmap();
    syncToolbarFromState();
  });

  function bindToolbar() {
    document.getElementById('addPhaseBtn').addEventListener('click', PT.addPhase);
    document.getElementById('addLineBtn').addEventListener('click', PT.addLine);
    document.getElementById('addRoleBtn').addEventListener('click', PT.addRole);

    document.getElementById('resetBtn').addEventListener('click', function () {
      if (confirm('Wirklich auf Standardwerte zurücksetzen? Alle Eingaben gehen verloren.')) {
        PT.reset();
        syncToolbarFromState();
      }
    });

    document.getElementById('exportBtn').addEventListener('click', PT.exportXlsx);

    var importInput = document.getElementById('importInput');
    importInput.addEventListener('change', function () {
      if (importInput.files && importInput.files[0]) {
        PT.importXlsx(importInput.files[0]);
        importInput.value = '';
        // Nach Import Toolbar-Inputs synchronisieren (passiert durch notify→renderAll, aber Toolbar selbst nicht)
        setTimeout(syncToolbarFromState, 50);
      }
    });

    var totalColor = document.getElementById('totalColor');
    totalColor.addEventListener('input', function () {
      PT.state.totalColor = totalColor.value;
      PT.save();
      PT.renderCharts();
    });

    var showTotal = document.getElementById('showTotal');
    showTotal.addEventListener('change', function () {
      PT.state.showTotal = showTotal.checked;
      PT.save();
      PT.renderCharts();
    });
  }

  function syncToolbarFromState() {
    var totalColor = document.getElementById('totalColor');
    var showTotal = document.getElementById('showTotal');
    if (totalColor) totalColor.value = PT.state.totalColor;
    if (showTotal) showTotal.checked = !!PT.state.showTotal;
  }

})(window.PT);
