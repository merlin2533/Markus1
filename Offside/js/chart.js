/* =============================================================
   Offside · interaktives Chart
   Rendert die Kommunikations-Elemente als verschiebbare Karten,
   zeichnet Verbindungen und unterstützt:
     - Verschieben (Maus + Touch)
     - Auswählen / Verbinden / Löschen (Tastatur)
     - Zoom (Buttons + Mausrad) und Fit-to-Screen
     - Filter (Ausgrauen nicht passender Karten)
     - Auto-Layout / Swimlanes (Bahnen-Hintergrund)
   ============================================================= */

const Chart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const NODE_W = 220;
  const NODE_H = 96;

  let svg, layerLanes, layerEdges, layerNodes;
  let connectMode = false;
  let connectFrom = null;
  let drag = null;        // { id, dx, dy, moved, node, lastX, lastY }
  let zoom = 1;
  let baseW = 1000, baseH = 600;
  let lanes = [];         // [{label, y, h}] aus Auto-Layout
  let filter = { text: '', aktion: '', kanal: '', hierarchie: '', person: '' };
  let lastSig = null;     // Struktur-Signatur für Render-Optimierung

  function init() {
    svg = document.getElementById('chart');
    svg.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Touch
    svg.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    // Zoom per Mausrad (mit Strg oder generell)
    document.getElementById('chart-scroll').addEventListener('wheel', onWheel, { passive: false });
    // Tastatur
    window.addEventListener('keydown', onKey);
    State.onChange(() => { lanes = lanesValidForPlan() ? lanes : []; render(true); });
    render(true);
  }

  /* ---------- Modi ---------- */
  function setConnectMode(on) {
    connectMode = on;
    connectFrom = null;
    svg.classList.toggle('connect-mode', on);
    const btn = document.getElementById('btn-connect');
    if (btn) btn.classList.toggle('active', on);
    render(true);
  }
  function isConnectMode() { return connectMode; }

  function setFilter(f) { filter = Object.assign({ text: '', aktion: '', kanal: '', hierarchie: '', person: '' }, f); render(true); }

  /* ---------- Zoom ---------- */
  function applyZoom() {
    svg.setAttribute('width', baseW * zoom);
    svg.setAttribute('height', baseH * zoom);
  }
  function zoomBy(factor) { zoom = clamp(zoom * factor, 0.3, 2.5); applyZoom(); }
  function setZoom(z) { zoom = clamp(z, 0.3, 2.5); applyZoom(); }
  function fit() {
    const wrap = document.getElementById('chart-scroll');
    const z = Math.min(wrap.clientWidth / baseW, wrap.clientHeight / baseH);
    setZoom(z * 0.96);
  }
  function onWheel(ev) {
    if (!(ev.ctrlKey || ev.metaKey)) return; // nur mit Strg zoomen, sonst scrollen
    ev.preventDefault();
    zoomBy(ev.deltaY < 0 ? 1.1 : 0.9);
  }

  /* ---------- Auto-Layout / Swimlanes ---------- */
  function autoLayout(by) {
    const data = State.get();
    const groupsOrder = [];
    const groups = {};
    const keyFn = e => by === 'hierarchie'
      ? (e.hierarchie || '— ohne Ebene —')
      : (e.zuordnung || '— ohne Zuordnung —');

    // Reihenfolge: bei Hierarchie nach Rang, sonst alphabetisch
    let order;
    if (by === 'hierarchie') {
      order = data.hierarchie.slice().sort((a, b) => (a.rang || 99) - (b.rang || 99)).map(h => h.ebene);
    } else {
      order = Array.from(new Set(data.elemente.map(keyFn))).sort();
    }
    data.elemente.forEach(e => {
      const k = keyFn(e);
      if (!groups[k]) { groups[k] = []; }
      groups[k].push(e);
    });
    // alle vorkommenden Keys, sortiert nach order
    const keys = Array.from(new Set(data.elemente.map(keyFn)))
      .sort((a, b) => idx(order, a) - idx(order, b));

    const padTop = 40, laneH = 150, padLeft = 170, gapX = 250;
    const positions = {};
    lanes = [];
    keys.forEach((k, li) => {
      const y = padTop + li * laneH;
      lanes.push({ label: k, y: y - 16, h: laneH });
      (groups[k] || []).forEach((e, ci) => {
        positions[e.id] = { x: padLeft + ci * gapX, y: y + (laneH - NODE_H) / 2 };
      });
    });
    State.setPositions(positions);
  }
  function lanesValidForPlan() { return lanes.length > 0; }
  function clearLanes() { lanes = []; render(true); }

  /* ---------- Filter-Logik ---------- */
  function matches(e) {
    const f = filter;
    if (f.aktion && e.aktion !== f.aktion) return false;
    if (f.kanal && e.kanal !== f.kanal) return false;
    if (f.hierarchie && e.hierarchie !== f.hierarchie) return false;
    if (f.person && e.zuordnung !== f.person && !(e.teilnehmer || []).includes(f.person)) return false;
    if (f.text) {
      const hay = (e.titel + ' ' + e.zuordnung + ' ' + (e.teilnehmer || []).join(' ') + ' ' + (e.notiz || '')).toLowerCase();
      if (!hay.includes(f.text.toLowerCase())) return false;
    }
    return true;
  }
  function filterActive() { return !!(filter.text || filter.aktion || filter.kanal || filter.hierarchie || filter.person); }

  /* ---------- Render ---------- */
  function signature() {
    const d = State.get();
    return JSON.stringify({
      e: d.elemente.map(e => [e.id, Math.round(e.x), Math.round(e.y), e.aktion, e.titel, e.zuordnung, e.zuordnungTyp, e.hierarchie, e.frequenz, e.kanal]),
      v: d.verbindungen.map(v => [v.id, v.von, v.bis, v.label]),
      lanes, connectFrom, connectMode
    });
  }

  function render(force) {
    const data = State.get();
    const sig = signature();
    if (!force && sig === lastSig) { updateSelectionAndDim(); return; }
    lastSig = sig;

    // Canvas-Basisgröße bestimmen
    baseW = 1000; baseH = 600;
    data.elemente.forEach(e => {
      baseW = Math.max(baseW, (e.x || 0) + NODE_W + 60);
      baseH = Math.max(baseH, (e.y || 0) + NODE_H + 60);
    });
    lanes.forEach(l => { baseH = Math.max(baseH, l.y + l.h + 40); });
    svg.setAttribute('viewBox', `0 0 ${baseW} ${baseH}`);
    applyZoom();

    svg.innerHTML = '';
    defs();
    layerLanes = group('lanes');
    layerEdges = group('edges');
    layerNodes = group('nodes');
    svg.appendChild(layerLanes);
    svg.appendChild(layerEdges);
    svg.appendChild(layerNodes);

    drawLanes();
    const byId = {};
    data.elemente.forEach(e => byId[e.id] = e);
    data.verbindungen.forEach(v => drawEdge(byId[v.von], byId[v.bis], v));
    data.elemente.forEach(drawNode);
    updateSelectionAndDim();
  }

  function updateSelectionAndDim() {
    const selId = State.selectedId();
    const fActive = filterActive();
    svg.querySelectorAll('.node').forEach(g => {
      const id = g.getAttribute('data-id');
      g.classList.toggle('selected', id === selId);
      g.classList.toggle('connect-from', id === connectFrom);
      const e = State.get().elemente.find(x => x.id === id);
      g.classList.toggle('dimmed', fActive && e && !matches(e));
    });
  }

  function defs() {
    const d = el('defs');
    const m = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#1e5aa8' }));
    d.appendChild(m);
    svg.appendChild(d);
  }

  function drawLanes() {
    if (!lanes.length) return;
    lanes.forEach((l, i) => {
      layerLanes.appendChild(el('rect', {
        x: 8, y: l.y, width: baseW - 16, height: l.h - 8, rx: 8, ry: 8,
        class: 'lane' + (i % 2 ? ' alt' : '')
      }));
      const t = el('text', { x: 18, y: l.y + 18, class: 'lane-label' });
      t.textContent = l.label;
      layerLanes.appendChild(t);
    });
  }

  function drawEdge(a, b, v) {
    if (!a || !b) return;
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2;
    const x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2;
    const [ex, ey] = edgePoint(x1, y1, x2, y2, b);
    layerEdges.appendChild(el('path', { d: `M${x1},${y1} L${ex},${ey}`, class: 'edge', 'marker-end': 'url(#arrow)' }));
    if (v.label) {
      const t = el('text', { x: (x1 + ex) / 2, y: (y1 + ey) / 2 - 6, class: 'edge-label' });
      t.textContent = v.label;
      layerEdges.appendChild(t);
    }
  }

  function edgePoint(x1, y1, x2, y2, node) {
    const cx = node.x + NODE_W / 2, cy = node.y + NODE_H / 2;
    const dx = x1 - x2, dy = y1 - y2;
    const hw = NODE_W / 2 + 4, hh = NODE_H / 2 + 4;
    let scale = Infinity;
    if (dx !== 0) scale = Math.min(scale, hw / Math.abs(dx));
    if (dy !== 0) scale = Math.min(scale, hh / Math.abs(dy));
    if (!isFinite(scale)) scale = 0;
    return [cx + dx * scale, cy + dy * scale];
  }

  function drawNode(e) {
    const art = AKTIONSARTEN[e.aktion] || AKTIONSARTEN.informieren;
    const g = el('g', { class: 'node', transform: `translate(${e.x},${e.y})`, 'data-id': e.id });

    g.appendChild(el('rect', { class: 'node-bg', width: NODE_W, height: NODE_H, rx: 10, ry: 10 }));
    g.appendChild(el('rect', { class: 'node-stripe', width: 8, height: NODE_H, rx: 4, ry: 4, fill: art.farbe }));

    const badge = el('g', { transform: 'translate(18,14)' });
    badge.appendChild(el('rect', { width: badgeWidth(art.kuerzel), height: 18, rx: 9, ry: 9, fill: art.farbe }));
    const bt = el('text', { x: badgeWidth(art.kuerzel) / 2, y: 13, class: 'badge-text' });
    bt.textContent = art.kuerzel; badge.appendChild(bt);
    g.appendChild(badge);

    const icon = el('text', { x: NODE_W - 18, y: 26, class: 'node-icon' });
    icon.textContent = e.zuordnungTyp === 'person' ? '👤' : '🏷️';
    g.appendChild(icon);

    const title = el('text', { x: 18, y: 50, class: 'node-title' });
    title.textContent = truncate(e.titel, 26); g.appendChild(title);

    const sub = el('text', { x: 18, y: 68, class: 'node-sub' });
    sub.textContent = truncate(e.zuordnung || '—', 30); g.appendChild(sub);

    const meta = el('text', { x: 18, y: 84, class: 'node-meta' });
    meta.textContent = `${e.hierarchie || ''} · ${e.frequenz || ''}`; g.appendChild(meta);

    const med = medium(e.kanal);
    const chipW = badgeWidth(e.kanal || '');
    const chip = el('g', { transform: `translate(${NODE_W - chipW - 12},${NODE_H - 24})` });
    chip.appendChild(el('rect', { width: chipW, height: 16, rx: 8, ry: 8, fill: med.farbe, opacity: 0.14 }));
    const ct = el('text', { x: chipW / 2, y: 12, class: 'chip-text', fill: med.farbe });
    ct.textContent = `${med.icon} ${truncate(e.kanal || '—', 14)}`;
    chip.appendChild(ct);
    g.appendChild(chip);

    layerNodes.appendChild(g);
  }

  function badgeWidth(txt) { return Math.max(34, String(txt).length * 7 + 12); }

  /* ---------- Interaktion (Maus & Touch gemeinsam) ---------- */
  function nodeGroupFrom(target) {
    let n = target;
    while (n && n !== svg) {
      if (n.classList && n.classList.contains('node')) return n;
      n = n.parentNode;
    }
    return null;
  }

  function pointerDown(clientX, clientY, target, ev) {
    const ng = nodeGroupFrom(target);
    if (!ng) { if (!connectMode) State.select(null); return; }
    const id = ng.getAttribute('data-id');

    if (connectMode) {
      if (!connectFrom) { connectFrom = id; render(true); }
      else { State.addVerbindung(connectFrom, id); connectFrom = null; }
      return;
    }
    State.select(id);
    const e2 = State.get().elemente.find(e => e.id === id);
    const pt = toSvg(clientX, clientY);
    drag = { id, dx: pt.x - e2.x, dy: pt.y - e2.y, moved: false, node: ng };
    if (ev) ev.preventDefault();
  }

  function pointerMove(clientX, clientY, ev) {
    if (!drag) return;
    if (ev) ev.preventDefault();
    const pt = toSvg(clientX, clientY);
    const nx = Math.max(0, pt.x - drag.dx);
    const ny = Math.max(0, pt.y - drag.dy);
    drag.moved = true;
    drag.lastX = nx; drag.lastY = ny;
    drag.node.setAttribute('transform', `translate(${nx},${ny})`);
    redrawEdgesOnly(nx, ny);
  }

  function pointerUp() {
    if (drag && drag.moved) State.moveElement(drag.id, drag.lastX, drag.lastY);
    drag = null;
  }

  function onDown(ev) { pointerDown(ev.clientX, ev.clientY, ev.target, ev); }
  function onMove(ev) { pointerMove(ev.clientX, ev.clientY); }
  function onUp() { pointerUp(); }
  function onTouchStart(ev) { const t = ev.touches[0]; if (t) pointerDown(t.clientX, t.clientY, ev.target, ev); }
  function onTouchMove(ev) { const t = ev.touches[0]; if (t) pointerMove(t.clientX, t.clientY, ev); }

  function onKey(ev) {
    // Undo/Redo
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); State.undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); State.redo(); return; }
    // nicht löschen, während in einem Eingabefeld getippt wird
    const tag = (ev.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (ev.key === 'Escape') { if (connectMode) setConnectMode(false); else State.select(null); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && !typing) {
      const sel = State.selected();
      if (sel && confirm('Element „' + sel.titel + '" löschen?')) State.deleteElement(sel.id);
    }
  }

  function redrawEdgesOnly(nx, ny) {
    if (!layerEdges) return;
    layerEdges.innerHTML = '';
    const data = State.get();
    const byId = {};
    data.elemente.forEach(e => byId[e.id] = (e.id === drag.id) ? Object.assign({}, e, { x: nx, y: ny }) : e);
    data.verbindungen.forEach(v => drawEdge(byId[v.von], byId[v.bis], v));
  }

  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* ---------- Helpers ---------- */
  function el(name, attrs) { const n = document.createElementNS(NS, name); if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function group(cls) { return el('g', { class: cls }); }
  function truncate(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function idx(arr, v) { const i = arr.indexOf(v); return i < 0 ? 999 : i; }

  return { init, setConnectMode, isConnectMode, setFilter, zoomBy, fit, autoLayout, clearLanes };
})();
