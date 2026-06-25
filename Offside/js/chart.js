/* =============================================================
   Offside · interaktives Chart
   Rendert die Kommunikations-Elemente als verschiebbare Karten
   auf einer SVG-Fläche, zeichnet Verbindungen und erlaubt:
     - Verschieben (Drag & Drop)
     - Auswählen
     - Verbinden (Verbindungs-Modus)
     - Löschen (über Panel)
   ============================================================= */

const Chart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 220;
  const NODE_H = 96;

  let svg, layerEdges, layerNodes;
  let connectMode = false;
  let connectFrom = null;
  let drag = null;        // { id, dx, dy, moved }

  function init() {
    svg = document.getElementById('chart');
    svg.addEventListener('mousedown', onCanvasDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    State.onChange(render);
    render();
  }

  function setConnectMode(on) {
    connectMode = on;
    connectFrom = null;
    svg.classList.toggle('connect-mode', on);
    const btn = document.getElementById('btn-connect');
    if (btn) btn.classList.toggle('active', on);
    render();
  }
  function isConnectMode() { return connectMode; }

  /* ---------- Rendering ---------- */
  function render() {
    const data = State.get();
    // Canvas-Größe an Inhalte anpassen
    let maxX = 1000, maxY = 600;
    data.elemente.forEach(e => {
      maxX = Math.max(maxX, (e.x || 0) + NODE_W + 60);
      maxY = Math.max(maxY, (e.y || 0) + NODE_H + 60);
    });
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    svg.setAttribute('width', maxX);
    svg.setAttribute('height', maxY);

    svg.innerHTML = '';
    defs();
    layerEdges = group('edges');
    layerNodes = group('nodes');
    svg.appendChild(layerEdges);
    svg.appendChild(layerNodes);

    const byId = {};
    data.elemente.forEach(e => byId[e.id] = e);
    data.verbindungen.forEach(v => drawEdge(byId[v.von], byId[v.bis], v));
    data.elemente.forEach(drawNode);
  }

  function defs() {
    const d = el('defs');
    const m = el('marker', {
      id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse'
    });
    m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#1e5aa8' }));
    d.appendChild(m);
    svg.appendChild(d);
  }

  function drawEdge(a, b, v) {
    if (!a || !b) return;
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2;
    const x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2;
    // Endpunkt an Knotenrand kürzen
    const [ex, ey] = edgePoint(x1, y1, x2, y2, b);
    const path = el('path', {
      d: `M${x1},${y1} L${ex},${ey}`,
      class: 'edge', 'marker-end': 'url(#arrow)'
    });
    layerEdges.appendChild(path);

    if (v.label) {
      const t = el('text', {
        x: (x1 + ex) / 2, y: (y1 + ey) / 2 - 6, class: 'edge-label'
      });
      t.textContent = v.label;
      layerEdges.appendChild(t);
    }
  }

  function edgePoint(x1, y1, x2, y2, node) {
    // Schnittpunkt der Linie mit dem Rechteck des Zielknotens
    const cx = node.x + NODE_W / 2, cy = node.y + NODE_H / 2;
    const dx = x1 - x2, dy = y1 - y2;
    const hw = NODE_W / 2 + 4, hh = NODE_H / 2 + 4;
    let scale = Infinity;
    if (dx !== 0) scale = Math.min(scale, hw / Math.abs(dx));
    if (dy !== 0) scale = Math.min(scale, hh / Math.abs(dy));
    return [cx + dx * scale, cy + dy * scale];
  }

  function drawNode(e) {
    const art = AKTIONSARTEN[e.aktion] || AKTIONSARTEN.informieren;
    const selected = State.selectedId() === e.id;
    const isFrom = connectFrom === e.id;

    const g = el('g', {
      class: 'node' + (selected ? ' selected' : '') + (isFrom ? ' connect-from' : ''),
      transform: `translate(${e.x},${e.y})`, 'data-id': e.id
    });

    g.appendChild(el('rect', {
      class: 'node-bg', width: NODE_W, height: NODE_H, rx: 10, ry: 10
    }));
    // Farbstreifen nach Aktionsart
    g.appendChild(el('rect', {
      class: 'node-stripe', width: 8, height: NODE_H, rx: 4, ry: 4, fill: art.farbe
    }));
    // Badge Aktionsart
    const badge = el('g', { transform: 'translate(18,14)' });
    const bg = el('rect', { width: badgeWidth(art.kuerzel), height: 18, rx: 9, ry: 9, fill: art.farbe });
    badge.appendChild(bg);
    const bt = el('text', { x: badgeWidth(art.kuerzel) / 2, y: 13, class: 'badge-text' });
    bt.textContent = art.kuerzel;
    badge.appendChild(bt);
    g.appendChild(badge);

    // Zuordnungs-Icon (Person / Thema)
    const icon = el('text', { x: NODE_W - 18, y: 26, class: 'node-icon' });
    icon.textContent = e.zuordnungTyp === 'person' ? '👤' : '🏷️';
    g.appendChild(icon);

    // Titel
    const title = el('text', { x: 18, y: 50, class: 'node-title' });
    title.textContent = truncate(e.titel, 26);
    g.appendChild(title);

    // Zuordnung
    const sub = el('text', { x: 18, y: 68, class: 'node-sub' });
    sub.textContent = truncate(e.zuordnung || '—', 30);
    g.appendChild(sub);

    // Meta-Zeile
    const meta = el('text', { x: 18, y: 84, class: 'node-meta' });
    meta.textContent = `${e.hierarchie || ''} · ${e.frequenz || ''}`;
    g.appendChild(meta);

    // Medium-Chip (über welches Medium wird kommuniziert)
    const med = medium(e.kanal);
    const chipW = badgeWidth((e.kanal || '') ) ;
    const chip = el('g', { transform: `translate(${NODE_W - chipW - 12},${NODE_H - 24})` });
    chip.appendChild(el('rect', { width: chipW, height: 16, rx: 8, ry: 8, fill: med.farbe, opacity: 0.14 }));
    const ct = el('text', { x: chipW / 2, y: 12, class: 'chip-text', fill: med.farbe });
    ct.textContent = `${med.icon} ${truncate(e.kanal || '—', 14)}`;
    chip.appendChild(ct);
    g.appendChild(chip);

    layerNodes.appendChild(g);
  }

  function badgeWidth(txt) { return Math.max(34, txt.length * 7 + 12); }

  /* ---------- Interaktion ---------- */
  function nodeGroupFrom(target) {
    let n = target;
    while (n && n !== svg) {
      if (n.classList && n.classList.contains('node')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function onCanvasDown(ev) {
    const ng = nodeGroupFrom(ev.target);
    if (!ng) {
      if (!connectMode) State.select(null);
      return;
    }
    const id = ng.getAttribute('data-id');

    if (connectMode) {
      if (!connectFrom) { connectFrom = id; render(); }
      else { State.addVerbindung(connectFrom, id); connectFrom = null; }
      return;
    }

    State.select(id);
    const el2 = State.get().elemente.find(e => e.id === id);
    const pt = toSvg(ev);
    drag = { id, dx: pt.x - el2.x, dy: pt.y - el2.y, moved: false, node: ng };
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!drag) return;
    const pt = toSvg(ev);
    let nx = Math.max(0, pt.x - drag.dx);
    let ny = Math.max(0, pt.y - drag.dy);
    drag.moved = true;
    drag.node.setAttribute('transform', `translate(${nx},${ny})`);
    drag.lastX = nx; drag.lastY = ny;
    // Kanten live nachziehen (einfacher Voll-Render gedrosselt)
    State.get().elemente.find(e => e.id === drag.id).x = nx;
    State.get().elemente.find(e => e.id === drag.id).y = ny;
    redrawEdgesOnly();
  }

  function onUp() {
    if (drag && drag.moved) {
      State.moveElement(drag.id, drag.lastX, drag.lastY);
    }
    drag = null;
  }

  function redrawEdgesOnly() {
    if (!layerEdges) return;
    layerEdges.innerHTML = '';
    const data = State.get();
    const byId = {};
    data.elemente.forEach(e => byId[e.id] = e);
    data.verbindungen.forEach(v => drawEdge(byId[v.von], byId[v.bis], v));
  }

  function toSvg(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ---------- Helpers ---------- */
  function el(name, attrs) {
    const node = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function group(cls) { return el('g', { class: cls }); }
  function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  return { init, setConnectMode, isConnectMode };
})();
