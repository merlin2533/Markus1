/* Chart.js Linien- und Balkendiagramm. PNG-Export für Liniendiagramm. */
(function (PT) {
  'use strict';

  var lineChart = null;
  var barChart = null;

  PT.initCharts = function () {
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
          tooltip: { mode: 'index' }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Tage' } },
          x: { title: { display: false } }
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
        plugins: { legend: { position: 'top', align: 'start' } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Tage' } } }
      }
    });
  };

  PT.renderCharts = function () {
    if (!lineChart || !barChart) return;
    var s = PT.state;
    var labels = s.phases.map(function (p) { return p.name; });

    var lineDatasets = s.roles.map(function (r) {
      return {
        label: r.name,
        data: r.values.slice(),
        borderColor: r.color,
        backgroundColor: PT.hexToRgba(r.color, 0.18),
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2
      };
    });

    if (s.showTotal) {
      lineDatasets.push({
        label: 'Gesamt',
        data: PT.cumulativePerPhase(),
        borderColor: s.totalColor,
        backgroundColor: PT.hexToRgba(s.totalColor, 0.05),
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 3
      });
    }

    lineChart.data.labels = labels;
    lineChart.data.datasets = lineDatasets;
    lineChart.update('none');

    var barDatasets = s.roles.map(function (r) {
      return {
        label: r.name,
        data: r.values.slice(),
        backgroundColor: r.color,
        borderColor: r.color,
        borderWidth: 1
      };
    });
    if (s.showTotal) {
      barDatasets.push({
        label: 'Gesamt',
        data: PT.cumulativePerPhase(),
        backgroundColor: PT.hexToRgba(s.totalColor, 0.4),
        borderColor: s.totalColor,
        borderWidth: 1
      });
    }
    barChart.data.labels = labels;
    barChart.data.datasets = barDatasets;
    barChart.update('none');
  };

  PT.resizeCharts = function () {
    if (lineChart) lineChart.resize();
    if (barChart) barChart.resize();
  };

  PT.exportLineChartPng = function () {
    if (!lineChart) return;
    var url = lineChart.toBase64Image('image/png', 1);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'aufwandsverlauf_' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

})(window.PT);
