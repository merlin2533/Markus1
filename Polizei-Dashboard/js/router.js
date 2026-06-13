/* router.js – Sidebar-Navigation und Hash-Routing. */
(function (POL) {
  'use strict';

  var NAV = [
    { route: 'cockpit', icon: '🛡️', label: 'Cockpit / Lagebild' },
    { sep: true, label: 'Bereiche' },
    { route: 'personal', icon: '👮', label: 'Personal' },
    { route: 'finanzen', icon: '💶', label: 'Finanzen' },
    { route: 'fuhrpark', icon: '🚓', label: 'Fuhrpark & Ausstattung' },
    { route: 'einsatz', icon: '🎯', label: 'Einsatz & Ausbildung' },
    { sep: true, label: 'Analyse' },
    { route: 'risiko', icon: '📉', label: 'Personalrisiko' },
    { route: 'pivot', icon: '🧮', label: 'Ad-hoc / Pivot' },
    { route: 'bericht', icon: '📄', label: 'Management-Bericht' },
    { sep: true, label: 'System' },
    { route: 'einstellungen', icon: '⚙️', label: 'Einstellungen' },
  ];

  POL.buildNav = function () {
    var nav = document.getElementById('sidebarNav');
    nav.innerHTML = NAV.map(function (n) {
      if (n.sep) return '<div class="nav-sep">' + n.label + '</div>';
      return '<a class="nav-item" data-route="' + n.route + '" href="#/' + n.route + '">' +
        '<span class="nav-icon">' + n.icon + '</span>' + n.label + '</a>';
    }).join('');
  };

  function setActive(route) {
    var base = route.split('/')[0];
    // Detailseiten markieren den zugehörigen Bereich
    if (base === 'detail') base = route.split('/')[1];
    document.querySelectorAll('.nav-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === base);
    });
  }

  function render(route) {
    var parts = route.split('/');
    // Aufräumen VOR dem Bauen der View (die View darf POL._afterRender setzen)
    POL.destroyCharts();
    POL._afterRender = null;

    var view;
    switch (parts[0]) {
      case 'personal': case 'finanzen': case 'fuhrpark': case 'einsatz':
        view = POL.viewBereich(parts[0]); break;
      case 'risiko': view = POL.viewRisiko(); break;
      case 'pivot': view = POL.viewPivot(); break;
      case 'bericht': view = POL.viewBericht(); break;
      case 'einstellungen': view = POL.viewEinstellungen(); break;
      case 'detail': view = POL.viewDetail(parts[1], parts[2]); break;
      case 'cockpit': default: view = POL.viewCockpit(); break;
    }
    var content = document.getElementById('content');
    content.innerHTML = '';
    content.appendChild(view);
    document.getElementById('currentTitle').textContent = titleFor(route);
    setActive(route);
    if (typeof POL._afterRender === 'function') { POL._afterRender(); POL._afterRender = null; }
    content.scrollTop = 0; window.scrollTo(0, 0);
  }

  function titleFor(route) {
    var p = route.split('/');
    if (p[0] === 'detail') { var k = POL.kpi(p[1], p[2]); return k ? k.label : 'Detail'; }
    var hit = NAV.filter(function (n) { return n.route === p[0]; })[0];
    return hit ? hit.label : 'Cockpit / Lagebild';
  }

  POL.route = function () {
    var hash = (location.hash || '#/cockpit').replace(/^#\//, '');
    if (!hash) hash = 'cockpit';
    render(hash);
  };

  POL.initRouter = function () {
    POL.buildNav();
    window.addEventListener('hashchange', POL.route);
    POL.route();
  };

})(window.POL);
