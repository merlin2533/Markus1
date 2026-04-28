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
    var s = PT.state;
    var labels = s.phases.map(function (p) { return p.name; });

    var datasets = [];

    // Normalaufwände: ein Dataset pro Linie
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
      });
    }

    // Zusatzaufwände: aggregiert pro Rolle
    if (s.showZusatz) {
      s.roles.forEach(function (r, ri) {
        datasets.push({
          label: r.name + ' (Zusatz)',
          data: PT.roleDaysAll(ri),
          borderColor: r.color,
          backgroundColor: PT.hexToRgba(r.color, 0.08),
          borderDash: [4, 4],
          tension: 0.4,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
          dragData: false,
          _dragKind: 'role'
        });
      });
    }

    // Gesamtlinie (kumuliert über Linien)
    if (s.showTotal && s.showNormal) {
      datasets.push({
        label: 'Gesamt',
        data: PT.cumulativePerPhase(),
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

    // Bar-Chart: Linien gestapelt, Rollen-Anteile (Zusatz) optional ontop in selbem Stack
    var barDatasets = [];
    s.lines.forEach(function (l) {
      barDatasets.push({
        label: l.name,
        data: l.values.slice(),
        backgroundColor: l.color,
        borderColor: l.color,
        borderWidth: 1,
        stack: 'effort'
      });
    });
    if (s.showZusatz) {
      s.roles.forEach(function (r, ri) {
        barDatasets.push({
          label: r.name + ' (Zusatz)',
          data: PT.roleDaysAll(ri).map(function (v) { return Math.round(v * 10) / 10; }),
          backgroundColor: PT.hexToRgba(r.color, 0.85),
          borderColor: r.color,
          borderWidth: 1,
          stack: 'effort'
        });
      });
    }
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
