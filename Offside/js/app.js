/* =============================================================
   Offside · App-Steuerung (UI)
   Verdrahtet Toolbar, Detail-Panel, Teilnehmer- und
   Hierarchie-Pflege sowie Import/Export.
   ============================================================= */

const App = (() => {
  let activeTab = 'detail';

  function init() {
    State.init();
    Chart.init();
    bindToolbar();
    State.onChange(renderSidebar);
    renderMeta();
    renderSidebar();
    renderLegende();
  }

  /* ---------------- Toolbar ---------------- */
  function bindToolbar() {
    on('btn-add', 'click', () => addElement());
    on('btn-connect', 'click', () => Chart.setConnectMode(!Chart.isConnectMode()));
    on('btn-export-xlsx', 'click', () => ExcelIO.exportXlsx());
    on('btn-export-png', 'click', () => ImageIO.exportPng());
    on('btn-import', 'click', () => document.getElementById('file-import').click());
    on('file-import', 'change', onImport);
    on('btn-reset', 'click', () => {
      if (confirm('Wirklich auf die DEMO-Daten zurücksetzen? Lokale Änderungen gehen verloren.')) State.reset();
    });

    // Tabs
    document.querySelectorAll('.tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.tab)));
  }

  function onImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    ExcelIO.importXlsx(file, (err, data) => {
      if (err) { alert('Import fehlgeschlagen: ' + err.message); }
      else { State.replace(data); renderMeta(); alert('Import erfolgreich.'); }
      ev.target.value = '';
    });
  }

  function addElement() {
    const d = State.get();
    // neue Karte versetzt platzieren
    const offset = (d.elemente.length % 6) * 30;
    State.addElement({
      titel: 'Neue Kommunikation',
      aktion: 'informieren',
      zuordnungTyp: 'person',
      zuordnung: (d.teilnehmer[0] || {}).name || '',
      hierarchie: (d.hierarchie[0] || {}).ebene || '',
      frequenz: 'Anlassbezogen',
      kanal: 'E-Mail',
      teilnehmer: [],
      notiz: '',
      x: 60 + offset, y: 60 + offset
    });
    switchTab('detail');
  }

  /* ---------------- Tabs ---------------- */
  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name));
    renderSidebar();
  }

  function renderSidebar() {
    if (activeTab === 'detail') renderDetail();
    else if (activeTab === 'teilnehmer') renderTeilnehmer();
    else if (activeTab === 'hierarchie') renderHierarchie();
    else if (activeTab === 'uebersicht') renderUebersicht();
  }

  /* ---------------- Detail-Panel ---------------- */
  function renderDetail() {
    const box = document.getElementById('panel');
    const el = State.selected();
    if (!el) {
      box.innerHTML = `<div class="empty">
        <p>📌 Kein Element ausgewählt.</p>
        <p class="hint">Klicke im Chart auf eine Karte, um sie zu bearbeiten – oder lege mit <b>+ Element</b> eine neue an.</p>
      </div>`;
      return;
    }
    const d = State.get();
    const personOpts = d.teilnehmer.filter(t => t.typ === 'person');
    const themaOpts  = d.teilnehmer.filter(t => t.typ === 'thema');
    const zuordListe = el.zuordnungTyp === 'person' ? personOpts : themaOpts;

    box.innerHTML = `
      <div class="form">
        <label>Titel der Kommunikation
          <input id="f-titel" value="${esc(el.titel)}">
        </label>

        <label>Aktionsart
          <select id="f-aktion">${optsObj(AKTIONSARTEN, el.aktion, a => a.label)}</select>
        </label>
        <p class="aktion-desc">${esc((AKTIONSARTEN[el.aktion] || {}).beschreibung || '')}</p>

        <div class="row">
          <label>Zuordnung
            <select id="f-ztyp">
              <option value="person" ${el.zuordnungTyp === 'person' ? 'selected' : ''}>👤 Person</option>
              <option value="thema" ${el.zuordnungTyp === 'thema' ? 'selected' : ''}>🏷️ Themengebiet</option>
            </select>
          </label>
          <label>${el.zuordnungTyp === 'person' ? 'Person' : 'Themengebiet'}
            <select id="f-zuordnung">
              <option value="">— wählen —</option>
              ${zuordListe.map(t => `<option ${t.name === el.zuordnung ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="row">
          <label>Hierarchie-Ebene
            <select id="f-hier">${optsArr(d.hierarchie.map(h => h.ebene), el.hierarchie)}</select>
          </label>
          <label>Frequenz
            <select id="f-freq">${optsArr(FREQUENZEN, el.frequenz)}</select>
          </label>
        </div>

        <label>Medium / Kanal
          <select id="f-kanal">${optsMedien(el.kanal)}</select>
        </label>

        <label>Teilnehmer (Mehrfachauswahl)
          <select id="f-teilnehmer" multiple size="5">
            ${d.teilnehmer.map(t => `<option ${(el.teilnehmer||[]).includes(t.name) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </label>

        <label>Notiz
          <textarea id="f-notiz" rows="3">${esc(el.notiz || '')}</textarea>
        </label>

        <div class="verb-list">
          <h4>Verbindungen ab dieser Karte</h4>
          ${verbHtml(el.id)}
        </div>

        <div class="actions">
          <button class="btn danger" id="f-delete">🗑 Element löschen</button>
        </div>
      </div>`;

    // Bindings (live speichern)
    const save = patch => State.updateElement(el.id, patch);
    bind('f-titel', 'input', v => save({ titel: v }));
    bind('f-aktion', 'change', v => save({ aktion: v }));
    bind('f-ztyp', 'change', v => { save({ zuordnungTyp: v, zuordnung: '' }); });
    bind('f-zuordnung', 'change', v => save({ zuordnung: v }));
    bind('f-hier', 'change', v => save({ hierarchie: v }));
    bind('f-freq', 'change', v => save({ frequenz: v }));
    bind('f-kanal', 'change', v => save({ kanal: v }));
    bind('f-notiz', 'input', v => save({ notiz: v }));
    document.getElementById('f-teilnehmer').addEventListener('change', e => {
      save({ teilnehmer: Array.from(e.target.selectedOptions).map(o => o.value) });
    });
    document.getElementById('f-delete').addEventListener('click', () => {
      if (confirm('Element „' + el.titel + '" löschen?')) State.deleteElement(el.id);
    });
    document.querySelectorAll('[data-delverb]').forEach(b =>
      b.addEventListener('click', () => State.deleteVerbindung(b.dataset.delverb)));
  }

  function verbHtml(id) {
    const d = State.get();
    const rows = d.verbindungen.filter(v => v.von === id || v.bis === id);
    if (!rows.length) return '<p class="hint">Keine. Nutze den Modus „Verbinden" in der Toolbar.</p>';
    const name = eid => (d.elemente.find(e => e.id === eid) || {}).titel || eid;
    return rows.map(v => `
      <div class="verb-row">
        <span>${v.von === id ? '→ ' : '← '}${esc(name(v.von === id ? v.bis : v.von))}</span>
        <button class="mini" data-delverb="${v.id}">✕</button>
      </div>`).join('');
  }

  /* ---------------- Teilnehmer-Pflege ---------------- */
  function renderTeilnehmer() {
    const box = document.getElementById('panel');
    const d = State.get();
    box.innerHTML = `
      <div class="manage">
        <h3>Teilnehmer-Pflege</h3>
        <p class="hint">Personen und Themengebiete, die Elementen zugeordnet werden können.</p>
        <table class="tbl">
          <thead><tr><th>Typ</th><th>Name</th><th>Einheit</th><th>Hierarchie</th><th></th></tr></thead>
          <tbody>
            ${d.teilnehmer.map(t => `
              <tr>
                <td>${t.typ === 'person' ? '👤' : '🏷️'}</td>
                <td>${esc(t.name)}</td>
                <td>${esc(t.einheit || '')}</td>
                <td>${esc(t.hierarchie || '')}</td>
                <td><button class="mini" data-delt="${t.id}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="add-form">
          <h4>Neu anlegen</h4>
          <div class="row">
            <select id="nt-typ"><option value="person">👤 Person</option><option value="thema">🏷️ Themengebiet</option></select>
            <input id="nt-name" placeholder="Name / Bezeichnung">
          </div>
          <div class="row">
            <input id="nt-einheit" placeholder="Organisationseinheit">
            <select id="nt-hier">${optsArr(d.hierarchie.map(h => h.ebene), '')}</select>
          </div>
          <input id="nt-kontakt" placeholder="Kontakt (optional)">
          <button class="btn primary" id="nt-add">+ Hinzufügen</button>
        </div>
      </div>`;
    document.querySelectorAll('[data-delt]').forEach(b =>
      b.addEventListener('click', () => State.deleteTeilnehmer(b.dataset.delt)));
    document.getElementById('nt-add').addEventListener('click', () => {
      const name = val('nt-name').trim();
      if (!name) { alert('Bitte einen Namen angeben.'); return; }
      State.addTeilnehmer({
        typ: val('nt-typ'), name, einheit: val('nt-einheit'),
        hierarchie: val('nt-hier'), kontakt: val('nt-kontakt')
      });
    });
  }

  /* ---------------- Hierarchie-Pflege ---------------- */
  function renderHierarchie() {
    const box = document.getElementById('panel');
    const d = State.get();
    const sorted = [...d.hierarchie].sort((a, b) => (a.rang || 99) - (b.rang || 99));
    box.innerHTML = `
      <div class="manage">
        <h3>Hierarchie-Pflege</h3>
        <p class="hint">Rang 1 = oberste Ebene. Die Reihenfolge steuert die Eskalationsrichtung.</p>
        <table class="tbl">
          <thead><tr><th>Rang</th><th>Ebene</th><th>Kurz</th><th></th></tr></thead>
          <tbody>
            ${sorted.map(h => `
              <tr>
                <td>${h.rang}</td>
                <td>${esc(h.ebene)}</td>
                <td>${esc(h.kurz || '')}</td>
                <td><button class="mini" data-delh="${h.id}">✕</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="add-form">
          <h4>Neue Ebene</h4>
          <div class="row">
            <input id="nh-ebene" placeholder="Bezeichnung der Ebene">
            <input id="nh-rang" type="number" min="1" placeholder="Rang" style="max-width:90px">
            <input id="nh-kurz" placeholder="Kürzel" style="max-width:90px">
          </div>
          <button class="btn primary" id="nh-add">+ Hinzufügen</button>
        </div>
      </div>`;
    document.querySelectorAll('[data-delh]').forEach(b =>
      b.addEventListener('click', () => State.deleteHierarchie(b.dataset.delh)));
    document.getElementById('nh-add').addEventListener('click', () => {
      const ebene = val('nh-ebene').trim();
      if (!ebene) { alert('Bitte eine Bezeichnung angeben.'); return; }
      State.addHierarchie({ ebene, rang: parseInt(val('nh-rang') || '99', 10), kurz: val('nh-kurz') });
    });
  }

  /* ---------------- Übersicht (Tabelle aller Elemente) ---------------- */
  function renderUebersicht() {
    const box = document.getElementById('panel');
    const d = State.get();
    box.innerHTML = `
      <div class="manage">
        <h3>Übersicht – alle Kommunikationen</h3>
        <table class="tbl small">
          <thead><tr><th>Aktion</th><th>Titel</th><th>Zuordnung</th><th>Medium</th></tr></thead>
          <tbody>
            ${d.elemente.map(e => {
              const a = AKTIONSARTEN[e.aktion] || {};
              const m = medium(e.kanal);
              return `<tr data-go="${e.id}">
                <td><span class="dot" style="background:${a.farbe}"></span>${esc(a.label||e.aktion)}</td>
                <td>${esc(e.titel)}</td>
                <td>${e.zuordnungTyp==='person'?'👤':'🏷️'} ${esc(e.zuordnung||'')}</td>
                <td>${m.icon} ${esc(e.kanal||'')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    document.querySelectorAll('[data-go]').forEach(r =>
      r.addEventListener('click', () => { State.select(r.dataset.go); switchTab('detail'); }));
  }

  /* ---------------- Meta & Legende ---------------- */
  function renderMeta() {
    const d = State.get();
    setText('plan-titel', d.meta.titel || 'Kommunikationsplan');
    setText('plan-sub', `${d.meta.behoerde || ''} · Stand ${d.meta.stand || ''}`);
  }

  function renderLegende() {
    const box = document.getElementById('legende');
    if (!box) return;
    box.innerHTML = Object.values(AKTIONSARTEN).map(a => `
      <span class="leg-item" title="${esc(a.beschreibung)}">
        <span class="dot" style="background:${a.farbe}"></span>${esc(a.label)}
      </span>`).join('');
  }

  /* ---------------- kleine Helfer ---------------- */
  function on(id, ev, fn) { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
  function bind(id, ev, fn) { const e = document.getElementById(id); if (e) e.addEventListener(ev, () => fn(e.value)); }
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function setText(id, t) { const e = document.getElementById(id); if (e) e.textContent = t; }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function optsArr(arr, sel) {
    return ['<option value="">— wählen —</option>']
      .concat(arr.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`)).join('');
  }
  function optsObj(obj, sel, lbl) {
    return Object.values(obj).map(o => `<option value="${o.key}" ${o.key === sel ? 'selected' : ''}>${esc(lbl(o))}</option>`).join('');
  }
  function optsMedien(sel) {
    return Object.keys(MEDIEN).map(k =>
      `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${medium(k).icon} ${esc(k)}</option>`).join('');
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', App.init);
