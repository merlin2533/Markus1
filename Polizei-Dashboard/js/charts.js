/* charts.js – Chart.js-Helfer. Verwaltet Instanzen, damit Re-Render sauber bleibt. */
(function (POL) {
  'use strict';

  var instances = {};
  var extra = [];
  function destroy(id) { if (instances[id]) { instances[id].destroy(); delete instances[id]; } }
  // für manuell erzeugte Chart-Instanzen (z. B. gestapelte Balken)
  POL.trackChart = function (c) { extra.push(c); return c; };
  POL.destroyCharts = function () {
    Object.keys(instances).forEach(destroy);
    extra.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    extra = [];
  };

  var GRID = 'rgba(0,0,0,.06)';
  function baseOpts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
    }, extra || {});
  }

  // Mini-Sparkline ohne Achsen (für KPI-Karten)
  POL.sparkline = function (canvas, values, farbe) {
    var id = canvas._cid || (canvas._cid = 'c' + Math.random().toString(36).slice(2));
    destroy(id);
    instances[id] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: values.map(function (_, i) { return i; }),
        datasets: [{
          data: values, borderColor: farbe || '#1f6feb', borderWidth: 2,
          pointRadius: 0, tension: 0.35, fill: true,
          backgroundColor: (farbe || '#1f6feb') + '18',
        }],
      },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { borderJoinStyle: 'round' } },
      }),
    });
  };

  // Verlauf (Linie) mit optionaler Ziel-Linie und Markierung Vormonat
  POL.lineChart = function (canvas, labels, datasets, opts) {
    opts = opts || {};
    var id = canvas._cid || (canvas._cid = 'c' + Math.random().toString(36).slice(2));
    destroy(id);
    instances[id] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: baseOpts({
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom' },
          tooltip: { callbacks: opts.tooltip || {} },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          y: { grid: { color: GRID }, beginAtZero: opts.beginAtZero !== false },
        },
      }),
    });
    return instances[id];
  };

  POL.barChart = function (canvas, labels, values, farbe, horizontal) {
    var id = canvas._cid || (canvas._cid = 'c' + Math.random().toString(36).slice(2));
    destroy(id);
    instances[id] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ data: values, backgroundColor: farbe || '#1f6feb', borderRadius: 4, maxBarThickness: 38 }],
      },
      options: baseOpts({
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: { grid: { display: !horizontal, color: GRID }, ticks: { autoSkip: false } },
          y: { grid: { display: horizontal, color: GRID }, beginAtZero: true },
        },
      }),
    });
  };

  POL.donutChart = function (canvas, labels, values, farben) {
    var id = canvas._cid || (canvas._cid = 'c' + Math.random().toString(36).slice(2));
    destroy(id);
    instances[id] = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: farben, borderWidth: 1, borderColor: '#fff' }] },
      options: baseOpts({ cutout: '58%', plugins: { legend: { display: true, position: 'right' } } }),
    });
  };

  POL.PALETTE = ['#1f6feb', '#2e7d32', '#b26a00', '#6f42c1', '#0aa2c0', '#d6336c', '#5c7cfa', '#f08c00', '#37b24d', '#1098ad'];
})(window.POL);
