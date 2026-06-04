/* Aufwandsverlauf-Chart mit:
   - Normalaufwände (Linien aus state.lines): pro Linie ein Dataset
   - Zusatzaufwände (berechnet aus Rollen × Prozenten): pro Rolle ein Dataset
   - Gesamtlinie (kumuliert über Linien)
   - Toggle: showNormal, showZusatz, showLabels (Werte am Punkt), showTotal
   - Drag-and-Drop: Linien-Datasets per chartjs-plugin-dragdata bearbeitbar
*/
(function (PT) {
  'use strict';

  var lineChart = null;
  var barChart = null;
  var pluginsRegistered = false;
  var stripePattern = null;
  var stripePatternBar = null;

  function makeStripePattern(strokeColor, bgColor) {
    var c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    var ctx = c.getContext('2d');
    if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 8, 8); }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2); ctx.lineTo(2, -2);
    ctx.moveTo(6, 10); ctx.lineTo(10, 6);
    ctx.stroke();
    return ctx.createPattern(c, 'repeat');
  }
  function ensurePatterns() {
    if (!stripePattern)    stripePattern    = makeStripePattern('rgba(120, 70, 30, 0.8)', 'rgba(200, 150, 90, 0.18)');
    if (!stripePatternBar) stripePatternBar = makeStripePattern('rgba(120, 70, 30, 0.9)', 'rgba(200, 150, 90, 0.55)');
  }

  // Per-Linie Schraffur (pro Farbe gecached)
  var linePatternCache = {};
  function getLinePattern(color, dense) {
    var key = color + (dense ? '_d' : '_l');
    if (linePatternCache[key]) return linePatternCache[key];
    var c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    var ctx = c.getContext('2d');
    ctx.fillStyle = PT.hexToRgba(color, dense ? 0.45 : 0.18);
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = PT.hexToRgba(color, 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 8); ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2); ctx.lineTo(2, -2);
    ctx.moveTo(6, 10); ctx.lineTo(10, 6);
    ctx.stroke();
    return (linePatternCache[key] = ctx.createPattern(c, 'repeat'));
  }

  function registerPluginsOnce() {
    if (pluginsRegistered) return;
    pluginsRegistered = true;
    if (typeof Chart !== 'undefined') {
      if (typeof window.ChartDataLabels !== 'undefined') {
        try { Chart.register(window.ChartDataLabels); } catch (e) {}
      }
    }
  }

  PT.initCharts = function () {
    registerPluginsOnce();
    var lineCtx = document.getElementById('lineChart');
    var barCtx  = document.getElementById('barChart');
    if (!lineCtx || !barCtx) return;

    lineChart = new Chart(lineCtx.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start' },
          tooltip: { mode: 'index' },
          datalabels: { display: false },
          dragData: {
            round: 0,
            showTooltip: true,
            onDragStart: function (e, datasetIndex, index, value) {
              var ds = lineChart.data.datasets[datasetIndex];
              if (!ds || ds._dragKind !== 'line') return false; // nur Linien-Datasets
            },
            onDragEnd: function (e, datasetIndex, index, value) {
              var ds = lineChart.data.datasets[datasetIndex];
              if (!ds || ds._dragKind !== 'line') return;
              var lineIdx = ds._lineIdx;
              if (lineIdx === undefined || lineIdx < 0) return;
              PT.pushHistory();
              PT.setLineValue(lineIdx, index, value);
              PT.save();
              if (typeof PT.refreshDerivedViews === 'function') PT.refreshDerivedViews();
              PT.renderTable();
            }
          }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Tage' } }
        }
      }
    });

    barChart = new Chart(barCtx.getContext('2d'), {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: 'top', align: 'start' },
          tooltip: { mode: 'index' },
          datalabels: { display: false }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Tage' } }
        }
      }
    });
  };

  PT.renderCharts = function () {
    if (!lineChart || !barChart) return;
    ensurePatterns();
    var s = PT.state;
    var labels = s.phases.map(function (p) { return p.name; });

    var datasets = [];
    var cumNormal = PT.cumulativePerPhase();
    var totalAll  = PT.totalPerPhase();

    // Normalaufwände: pro Linie ein Basis-Dataset; bei showZusatz zusätzlich
    // ein "(inkl Zusatz)"-Dataset mit schraffierter Fläche zwischen Basis und inkl-Zusatz.
    if (s.showNormal) {
      s.lines.forEach(function (l, li) {
        datasets.push({
          label: l.name,
          data: l.values.slice(),
          borderColor: l.color,
          backgroundColor: PT.hexToRgba(l.color, 0.18),
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2,
          dragData: true,
          _dragKind: 'line',
          _lineIdx: li
        });
        if (s.showZusatz) {
          var zus = PT.lineZusatzPerPhase(li);
          var inkl = l.values.map(function (v, i) { return v + (zus[i] || 0); });
          datasets.push({
            label: l.name + ' (inkl Zusatz)',
            data: inkl,
            borderColor: PT.hexToRgba(l.color, 0.85),
            backgroundColor: getLinePattern(l.color, false),
            borderDash: [3, 3],
            tension: 0.4,
            fill: '-1',
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 1.5,
            dragData: false,
            _dragKind: 'line-inkl'
          });
        }
      });
    }

    // Einzelne Rollenlinien (Default ausgeblendet, einblendbar)
    if (s.showZusatz && s.showRoleLines) {
      s.roles.forEach(function (r, ri) {
        datasets.push({
          label: r.name + ' (Rolle)',
          data: PT.roleDaysAll(ri),
          borderColor: r.color,
          backgroundColor: 'transparent',
          borderDash: [2, 4],
          tension: 0.4,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 1.5,
          dragData: false,
          _dragKind: 'role'
        });
      });
    }

    // Gesamtlinie inkl. (oder ohne) Zusatz – immer als kräftige Top-Linie
    if (s.showTotal) {
      var grand = s.showZusatz ? totalAll.slice() : cumNormal.slice();
      datasets.push({
        label: s.showZusatz ? 'Gesamt (inkl. Zusatz)' : 'Gesamt',
        data: grand,
        borderColor: s.totalColor,
        backgroundColor: PT.hexToRgba(s.totalColor, 0.05),
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3,
        dragData: false,
        _dragKind: 'total'
      });
    }

    lineChart.data.labels = labels;
    lineChart.data.datasets = datasets;

    var dlOpts = s.showLabels
      ? { display: true, color: '#1f2933', font: { size: 10, weight: '600' },
          formatter: function (v) { return Math.round(v * 10) / 10; },
          align: 'top', anchor: 'end', backgroundColor: 'rgba(255,255,255,0.6)',
          borderRadius: 3, padding: 2 }
      : { display: false };
    lineChart.options.plugins.datalabels = dlOpts;

    lineChart.update('none');

    // Bar-Chart: pro Linie Basis + (bei showZusatz) schraffierter Zusatz oben
    var barDatasets = [];
    s.lines.forEach(function (l, li) {
      barDatasets.push({
        label: l.name,
        data: l.values.slice(),
        backgroundColor: l.color,
        borderColor: l.color,
        borderWidth: 1,
        stack: 'effort'
      });
      if (s.showZusatz) {
        var zus = PT.lineZusatzPerPhase(li).map(function (v) { return Math.round(v * 10) / 10; });
        barDatasets.push({
          label: l.name + ' (Zusatz)',
          data: zus,
          backgroundColor: getLinePattern(l.color, true),
          borderColor: PT.hexToRgba(l.color, 0.85),
          borderWidth: 1,
          stack: 'effort'
        });
      }
    });
    barChart.data.labels = labels;
    barChart.data.datasets = barDatasets;
    barChart.options.plugins.datalabels = dlOpts;
    barChart.update('none');
  };

  PT.resizeCharts = function () {
    if (lineChart) lineChart.resize();
    if (barChart) barChart.resize();
  };

  function downloadPng(chart, filename) {
    if (!chart) return;
    var url = chart.toBase64Image('image/png', 1);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename + '_' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  PT.exportLineChartPng = function () { downloadPng(lineChart, 'aufwandsverlauf'); };
  PT.exportBarChartPng  = function () { downloadPng(barChart,  'balkendiagramm'); };

})(window.PT);
