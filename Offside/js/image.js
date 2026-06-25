/* =============================================================
   Offside · Bild-Export
   Serialisiert die SVG-Zeichenfläche und rendert sie auf ein
   Canvas, das als PNG heruntergeladen wird – ohne externe Library.
   ============================================================= */

const ImageIO = (() => {

  function exportPng() {
    const svg = document.getElementById('chart');
    const vb = svg.viewBox.baseVal;
    const w = Math.max(vb.width, 800);
    const h = Math.max(vb.height, 600);
    const scale = 2; // schärferes Bild

    // Inline-Styles einbetten, damit das Standalone-SVG korrekt aussieht
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);

    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = svgStyles();
    clone.insertBefore(style, clone.firstChild);

    // weißer Hintergrund
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', w); bg.setAttribute('height', h);
    bg.setAttribute('fill', '#f4f7fb');
    clone.insertBefore(bg, clone.firstChild);

    // Titel + DEMO-Wasserzeichen
    addTitle(clone, w);

    const xml = new XMLSerializer().serializeToString(clone);
    const svg64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      drawWatermark(ctx, w, h);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Offside_Kommunikationsplan.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.onerror = () => alert('Bild-Export fehlgeschlagen.');
    img.src = svg64;
  }

  function addTitle(clone, w) {
    const ns = 'http://www.w3.org/2000/svg';
    const meta = State.get().meta || {};
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', 24); t.setAttribute('y', 30);
    t.setAttribute('font-family', 'Segoe UI, Arial, sans-serif');
    t.setAttribute('font-size', '20'); t.setAttribute('font-weight', '700');
    t.setAttribute('fill', '#0f3d73');
    t.textContent = meta.titel || 'Kommunikationsplan';
    clone.appendChild(t);
  }

  function drawWatermark(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#1e5aa8';
    ctx.font = 'bold 90px Segoe UI, Arial, sans-serif';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 9);
    ctx.textAlign = 'center';
    ctx.fillText('DEMO', 0, 0);
    ctx.restore();
  }

  /* CSS-Regeln, die für das eigenständige SVG nötig sind */
  function svgStyles() {
    return `
      .edge { fill:none; stroke:#7d97b5; stroke-width:2; }
      .edge-label { font:600 11px Segoe UI, Arial; fill:#445; text-anchor:middle; }
      .node-bg { fill:#ffffff; stroke:#c7d6ea; stroke-width:1.5; }
      .node.selected .node-bg { stroke:#1e5aa8; stroke-width:2.5; }
      .badge-text { font:700 10px Segoe UI, Arial; fill:#fff; text-anchor:middle; }
      .node-title { font:700 13px Segoe UI, Arial; fill:#15263b; }
      .node-sub { font:600 12px Segoe UI, Arial; fill:#1e5aa8; }
      .node-meta { font:400 10px Segoe UI, Arial; fill:#6a7c93; }
      .node-icon { font-size:14px; text-anchor:middle; }
      .chip-text { font:600 10px Segoe UI, Arial; text-anchor:middle; }
    `;
  }

  return { exportPng };
})();
