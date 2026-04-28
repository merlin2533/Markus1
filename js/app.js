/* App-Initialisierung, Toolbar-Wiring, Drop-Zone, Tastatur-Shortcuts. */
(function (PT) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    PT.load();

    PT.initTable();
    PT.initCharts();
    PT.initProcess();
    PT.initHeatmap();

    PT.refreshDerivedViews = function () {
      PT.renderCharts();
      PT.renderHeatmap();
      if (typeof PT.updateAllSums === 'function') PT.updateAllSums();
    };

    PT.subscribe(function () {
      PT.renderTable();
      PT.renderCharts();
      PT.renderProcess();
      PT.renderHeatmap();
      syncToolbarFromState();
      updateUndoRedoButtons();
    });

    bindToolbar();
    bindKeyboard();
    bindDropzone();
    bindDetailsResize();

    PT.renderTable();
    PT.renderCharts();
    PT.renderProcess();
    PT.renderHeatmap();
    syncToolbarFromState();
    updateUndoRedoButtons();
  });

  function bindToolbar() {
    byId('addPhaseBtn').addEventListener('click', PT.addSubPhase);
    byId('addLineBtn').addEventListener('click', PT.addLine);
    byId('addRoleBtn').addEventListener('click', PT.addRole);

    byId('resetBtn').addEventListener('click', function () {
      if (confirm('Wirklich auf Standardwerte zurücksetzen? Alle Eingaben gehen verloren.')) PT.reset();
    });

    byId('exportBtn').addEventListener('click', PT.exportXlsx);
    var importInput = byId('importInput');
    importInput.addEventListener('change', function () {
      if (importInput.files && importInput.files[0]) {
        PT.importXlsx(importInput.files[0]);
        importInput.value = '';
      }
    });

    var totalColor = byId('totalColor');
    totalColor.addEventListener('input', function () {
      PT.state.totalColor = totalColor.value; PT.save(); PT.renderCharts();
    });

    bindBoolToggle('showTotal',  function (v) { PT.state.showTotal = v;  PT.renderCharts(); });
    bindBoolToggle('showNormal', function (v) { PT.state.showNormal = v; PT.renderCharts(); });
    bindBoolToggle('showZusatz', function (v) { PT.state.showZusatz = v; PT.renderCharts(); });
    bindBoolToggle('showLabels', function (v) { PT.state.showLabels = v; PT.renderCharts(); });

    byId('undoBtn').addEventListener('click', PT.undo);
    byId('redoBtn').addEventListener('click', PT.redo);
    byId('pngBtn').addEventListener('click', PT.exportLineChartPng);
    byId('printBtn').addEventListener('click', function () { window.print(); });
  }

  function bindBoolToggle(id, applyFn) {
    var el = byId(id);
    if (!el) return;
    el.addEventListener('change', function () {
      applyFn(el.checked);
      PT.save();
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); PT.undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); PT.redo(); }
      else if (key === 'p') { e.preventDefault(); window.print(); }
    });
  }

  function bindDropzone() {
    var overlay = byId('dropOverlay');
    var counter = 0;
    function show() { overlay.classList.add('visible'); }
    function hide() { overlay.classList.remove('visible'); }
    window.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      counter++; show();
    });
    window.addEventListener('dragleave', function () {
      counter--; if (counter <= 0) { counter = 0; hide(); }
    });
    window.addEventListener('dragover', function (e) {
      if (!e.dataTransfer) return;
      var hasFiles = Array.from(e.dataTransfer.types || []).includes('Files');
      if (hasFiles) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    window.addEventListener('drop', function (e) {
      counter = 0; hide();
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      var f = e.dataTransfer.files[0];
      if (/\.xlsx?$/i.test(f.name)) PT.importXlsx(f);
      else alert('Bitte eine .xlsx-Datei ablegen.');
    });
  }

  function bindDetailsResize() {
    document.querySelectorAll('details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open && typeof PT.resizeCharts === 'function') {
          setTimeout(PT.resizeCharts, 0);
        }
      });
    });
  }

  function syncToolbarFromState() {
    var s = PT.state;
    var pairs = [
      ['totalColor', 'value', s.totalColor],
      ['showTotal',  'checked', !!s.showTotal],
      ['showNormal', 'checked', s.showNormal !== false],
      ['showZusatz', 'checked', !!s.showZusatz],
      ['showLabels', 'checked', !!s.showLabels]
    ];
    pairs.forEach(function (p) {
      var el = byId(p[0]); if (el) el[p[1]] = p[2];
    });
  }

  function updateUndoRedoButtons() {
    var u = byId('undoBtn'); var r = byId('redoBtn');
    if (u) u.disabled = !PT.canUndo();
    if (r) r.disabled = !PT.canRedo();
  }

  function byId(id) { return document.getElementById(id); }

})(window.PT);
