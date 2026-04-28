/* Chart.js Linien- und Balkendiagramm. */
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
        plugins: {
          legend: { position: 'top', align: 'start' }
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Tage' } }
        }
      }
    });
  };

  PT.renderCharts = function () {
    if (!lineChart || !barChart) return;
    var s = PT.state;
    var labels = s.phases.map(function (p) { return p.name; });

    var lineDatasets = s.lines.map(function (l) {
      return {
        label: l.name,
        data: l.values.slice(),
        borderColor: l.color,
        backgroundColor: PT.hexToRgba(l.color, 0.18),
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
        borderWidth: 3,
        borderDash: []
      });
    }

    lineChart.data.labels = labels;
    lineChart.data.datasets = lineDatasets;
    lineChart.update();

    // Bar chart: gruppiert pro Phase, ein Balken pro Linie
    var barDatasets = s.lines.map(function (l) {
      return {
        label: l.name,
        data: l.values.slice(),
        backgroundColor: l.color,
        borderColor: l.color,
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
    barChart.update();
  };

})(window.PT);
