/* =============================================================
   Offside · App-Steuerung (UI)
   Verdrahtet Toolbar, Plan-Verwaltung, Detail-Panel, Stammdaten-
   Pflege (editierbar), Filter, Auswertung sowie Import/Export.
   ============================================================= */

const App = (() => {
  let activeTab = 'detail';
  let editTeilnehmer = null;   // id der gerade bearbeiteten Zeile
  let editHierarchie = null;

  function init() {
    State.init();
    Chart.init();
    bindToolbar();
    bindFilter();
    State.onChange(() => { renderMeta(); renderPlanSelect(); renderSidebar(); updateUndoButtons(); });
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    renderMeta(); renderPlanSelect(); renderSidebar(); renderLegende(); updateUndoButtons();
    setTimeout(() => Chart.fit(), 50);
  }

  /* ---------------- Toolbar ---------------- */
  function bindToolbar() {
    on('btn-add', 'click', addElement);
    on('btn-connect', 'click', () => Chart.setConnectMode(!Chart.isConnectMode()));
    on('btn-undo', 'click', () => State.undo());
    on('btn-redo', 'click', () => State.redo());
    on('btn-zoom-in', 'click', () => Chart.zoomBy(1.15));
    on('btn-zoom-out', 'click', () => Chart.zoomBy(0.87));
    on('btn-fit', 'click', () => Chart.fit());
    on('btn-layout-hier', 'click', () => Chart.autoLayout('hierarchie'));
    on('btn-layout-person', 'click', () => Chart.autoLayout('person'));
    on('btn-layout-clear', 'click', () => Chart.clearLanes());
    on('btn-export-xlsx', 'click', () => ExcelIO.exportXlsx());
    on('btn-export-png', 'click', () => ImageIO.exportPng());
    on('btn-print', 'click', () => window.print());
    on('btn-import', 'click', () => document.getElementById('file-import').click());
    on('file-import', 'change', onImport);
    on('btn-backup', 'click', exportWorkspace);
    on('btn-restore', 'click', () => document.getElementById('file-restore').click());
    on('file-restore', 'change', onRestore);
    on('btn-reset', 'click', () => { if (confirm('Aktiven Plan auf DEMO-Daten zurücksetzen? Änderungen gehen verloren.')) State.resetAktiv(); });

    // Plan-Verwaltung
    on('plan-select', 'change', e => State.switchPlan(e.target.value));
    on('btn-plan-new', 'click', () => { const n = prompt('Name des neuen Plans:', 'Neuer Plan'); if (n) State.createPlan(n); });
    on('btn-plan-dup', 'click', () => State.duplicatePlan());
    on('btn-plan-rename', 'click', () => { const p = State.get(); const n = prompt('Plan umbenennen:', p.name); if (n) State.renamePlan(State.aktivId(), n); });
    on('btn-plan-del', 'click', () => {
      if (State.listPlaene().length <= 1) { alert('Der letzte Plan kann nicht gelöscht werden.'); return; }
      if (confirm('Aktiven Plan wirklich löschen?')) State.deletePlan();
    });
  }

  function updateUndoButtons() {
    const u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
    if (u) u.disabled = !State.canUndo();
    if (r) r.disabled = !State.canRedo();
  }

  function renderPlanSelect() {
    const sel = document.getElementById('plan-select');
    if (!sel) return;
    const plaene = State.listPlaene();
    sel.innerHTML = plaene.map(p => `<option value="${p.id}" ${p.id === State.aktivId() ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }

  function onImport(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    ExcelIO.importXlsx(file, (err, data) => {
      if (err) { alert('Import fehlgeschlagen: ' + err.message); ev.target.value = ''; return; }
      const alsNeu = confirm('Import als NEUEN Plan anlegen?\n\nOK = neuer Plan · Abbrechen = aktiven Plan ersetzen');
      State.importPlan(data, alsNeu, (data.meta && data.meta.titel) || file.name.replace(/\.xlsx?$/i, ''));
      alert('Import erfolgreich.');
      ev.target.value = '';
    });
  }

  /* ---- Gesamt-Backup (alle Pläne) als JSON ---- */
  function exportWorkspace() {
    const data = State.exportWorkspace();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Offside_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function onRestore(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (!confirm('Backup wiederherstellen? Der aktuelle Arbeitsbereich (alle Pläne) wird ersetzt.')) { ev.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
      try { State.importWorkspace(JSON.parse(e.target.result)); alert('Backup wiederhergestellt.'); }
      catch (err) { alert('Wiederherstellung fehlgeschlagen: ' + err.message); }
      ev.target.value = '';
    };
    reader.onerror = () => { alert('Datei konnte nicht gelesen werden.'); ev.target.value = ''; };
    reader.readAsText(file);
  }

  function addElement() {
    const d = State.get();
    const offset = (d.elemente.length % 6) * 30;
    State.addElement({
      titel: 'Neue Kommunikation', aktion: 'informieren',
      zuordnungTyp: 'person', zuordnung: (d.teilnehmer.find(t => t.typ === 'person') || {}).name || '',
      hierarchie: (d.hierarchie[0] || {}).ebene || '', frequenz: 'Anlassbezogen', kanal: 'E-Mail',
      status: 'offen', termin: '', teilnehmer: [], notiz: '', x: 60 + offset, y: 60 + offset
    });
    switchTab('detail');
  }

  /* ---------------- Tabs ---------------- */
  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    renderSidebar();
  }
  function renderSidebar() {
    if (activeTab === 'detail') renderDetail();
    else if (activeTab === 'teilnehmer') renderTeilnehmer();
    else if (activeTab === 'hierarchie') renderHierarchie();
    else if (activeTab === 'auswertung') renderAuswertung();
    else if (activeTab === 'timeline') renderTimeline();
    else if (activeTab === 'plan') renderPlanTab();
  }

  /* ---------------- Timeline (nach Termin sortiert) ---------------- */
  function renderTimeline() {
    const box = document.getElementById('panel');
    const d = State.get();
    const withDate = d.elemente.filter(e => e.termin).sort((a, b) => a.termin.localeCompare(b.termin));
    const without = d.elemente.filter(e => !e.termin);
    const row = e => {
      const a = AKTIONSARTEN[e.aktion] || {};
      const st = statusInfo(e.status);
      return `<div class="tl-row" data-go="${e.id}">
        <span class="tl-date">${esc(e.termin || '—')}</span>
        <span class="tl-dot" style="background:${a.farbe}"></span>
        <span class="tl-titel">${esc(e.titel)}</span>
        <span class="tl-status" style="background:${st.farbe}">${esc(st.label)}</span>
      </div>`;
    };
    box.innerHTML = `
      <div class="manage">
        <h3>Timeline</h3>
        <p class="hint">Kommunikationen nach Termin/Frist. Klick springt zum Element.</p>
        ${withDate.length ? withDate.map(row).join('') : '<p class="hint">Keine Termine gesetzt.</p>'}
        ${without.length ? `<h4>Ohne Termin</h4>${without.map(row).join('')}` : ''}
      </div>`;
    document.querySelectorAll('[data-go]').forEach(r => r.addEventListener('click', () => { State.select(r.dataset.go); switchTab('detail'); }));
  }

  /* ---------------- Detail-Panel ---------------- */
  function renderDetail() {
    const box = document.getElementById('panel');
    const el = State.selected();
    if (!el) {
      box.innerHTML = `<div class="empty">
        <p>📌 Kein Element ausgewählt.</p>
        <p class="hint">Klicke im Chart auf eine Karte – oder lege mit <b>＋ Element</b> eine neue an.
        <br>Löschen: Karte wählen und <b>Entf</b>. Verbinden: Modus „🔗 Verbinden" → zwei Karten klicken.</p>
      </div>`;
      return;
    }
    const d = State.get();
    const zuordListe = (el.zuordnungTyp === 'person' ? d.teilnehmer.filter(t => t.typ === 'person') : d.teilnehmer.filter(t => t.typ === 'thema'));

    box.innerHTML = `
      <div class="form">
        <label>Titel der Kommunikation<input id="f-titel" value="${esc(el.titel)}"></label>
        <label>Aktionsart<select id="f-aktion">${optsObj(AKTIONSARTEN, el.aktion, a => a.label)}</select></label>
        <p class="aktion-desc">${esc((AKTIONSARTEN[el.aktion] || {}).beschreibung || '')}</p>
        <div class="row">
          <label>Zuordnung
            <select id="f-ztyp">
              <option value="person" ${el.zuordnungTyp === 'person' ? 'selected' : ''}>👤 Person</option>
              <option value="thema" ${el.zuordnungTyp === 'thema' ? 'selected' : ''}>🏷️ Themengebiet</option>
            </select>
          </label>
          <label>${el.zuordnungTyp === 'person' ? 'Person' : 'Themengebiet'}
            <select id="f-zuordnung"><option value="">— wählen —</option>
              ${zuordListe.map(t => `<option ${t.name === el.zuordnung ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="row">
          <label>Hierarchie-Ebene<select id="f-hier">${optsArr(d.hierarchie.map(h => h.ebene), el.hierarchie)}</select></label>
          <label>Frequenz<select id="f-freq">${optsArr(FREQUENZEN, el.frequenz)}</select></label>
        </div>
        <label>Medium / Kanal<select id="f-kanal">${optsMedien(el.kanal)}</select></label>
        <div class="row">
          <label>Status<select id="f-status">${optsStatus(el.status || 'offen')}</select></label>
          <label>Termin / Frist<input id="f-termin" type="date" value="${esc(el.termin || '')}"></label>
        </div>
        <label>Teilnehmer (Mehrfachauswahl)
          <select id="f-teilnehmer" multiple size="5">
            ${d.teilnehmer.map(t => `<option ${(el.teilnehmer || []).includes(t.name) ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select>
        </label>
        <label>Notiz<textarea id="f-notiz" rows="3">${esc(el.notiz || '')}</textarea></label>
        <div class="verb-list"><h4>Verbindungen ab/zu dieser Karte</h4>${verbHtml(el.id)}</div>
        <div class="actions row">
          <button class="btn" id="f-dup">⧉ Duplizieren</button>
          <button class="btn danger" id="f-delete">🗑 Löschen</button>
        </div>
      </div>`;

    const save = patch => State.updateElement(el.id, patch);
    bind('f-titel', 'input', v => save({ titel: v }));
    bind('f-aktion', 'change', v => save({ aktion: v }));
    bind('f-ztyp', 'change', v => save({ zuordnungTyp: v, zuordnung: '' }));
    bind('f-zuordnung', 'change', v => save({ zuordnung: v }));
    bind('f-hier', 'change', v => save({ hierarchie: v }));
    bind('f-freq', 'change', v => save({ frequenz: v }));
    bind('f-kanal', 'change', v => save({ kanal: v }));
    bind('f-status', 'change', v => save({ status: v }));
    bind('f-termin', 'change', v => save({ termin: v }));
    bind('f-notiz', 'input', v => save({ notiz: v }));
    document.getElementById('f-teilnehmer').addEventListener('change', e =>
      save({ teilnehmer: Array.from(e.target.selectedOptions).map(o => o.value) }));
    document.getElementById('f-delete').addEventListener('click', () => {
      if (confirm('Element „' + el.titel + '" löschen?')) State.deleteElement(el.id);
    });
    document.getElementById('f-dup').addEventListener('click', () => State.duplicateElement(el.id));
    document.querySelectorAll('[data-delverb]').forEach(b => b.addEventListener('click', () => State.deleteVerbindung(b.dataset.delverb)));
    document.querySelectorAll('[data-lblverb]').forEach(inp =>
      inp.addEventListener('change', () => State.updateVerbindung(inp.dataset.lblverb, { label: inp.value })));
    document.querySelectorAll('[data-flipverb]').forEach(b => b.addEventListener('click', () => {
      const v = State.get().verbindungen.find(x => x.id === b.dataset.flipverb);
      if (v) State.updateVerbindung(v.id, { von: v.bis, bis: v.von });
    }));
  }

  function verbHtml(id) {
    const d = State.get();
    const rows = d.verbindungen.filter(v => v.von === id || v.bis === id);
    if (!rows.length) return '<p class="hint">Keine. Nutze den Modus „🔗 Verbinden".</p>';
    const name = eid => (d.elemente.find(e => e.id === eid) || {}).titel || eid;
    return rows.map(v => `
      <div class="verb-row">
        <span class="verb-dir">${v.von === id ? '→' : '←'} ${esc(name(v.von === id ? v.bis : v.von))}</span>
        <input class="verb-label" data-lblverb="${v.id}" value="${esc(v.label || '')}" placeholder="Label">
        <button class="mini blue" data-flipverb="${v.id}" title="Richtung umkehren">⇄</button>
        <button class="mini" data-delverb="${v.id}">✕</button>
      </div>`).join('');
  }

  /* ---------------- Teilnehmer-Pflege (editierbar) ---------------- */
  function renderTeilnehmer() {
    const box = document.getElementById('panel');
    const d = State.get();
    box.innerHTML = `
      <div class="manage">
        <h3>Teilnehmer-Pflege</h3>
        <p class="hint">Personen & Themengebiete. Umbenennen wirkt automatisch in allen Elementen.</p>
        <table class="tbl">
          <thead><tr><th>Typ</th><th>Name</th><th>Einheit</th><th>Hierarchie</th><th></th></tr></thead>
          <tbody>
            ${d.teilnehmer.map(t => editTeilnehmer === t.id ? teilEditRow(t, d) : teilViewRow(t)).join('')}
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
          <button class="btn primary" id="nt-add">＋ Hinzufügen</button>
        </div>
      </div>`;
    // View-Aktionen
    document.querySelectorAll('[data-editt]').forEach(b => b.addEventListener('click', () => { editTeilnehmer = b.dataset.editt; renderTeilnehmer(); }));
    document.querySelectorAll('[data-delt]').forEach(b => b.addEventListener('click', () => State.deleteTeilnehmer(b.dataset.delt)));
    // Edit-Aktionen
    document.querySelectorAll('[data-savet]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.savet;
      State.updateTeilnehmer(id, {
        typ: val('et-typ'), name: val('et-name').trim(), einheit: val('et-einheit'),
        hierarchie: val('et-hier'), kontakt: val('et-kontakt')
      });
      editTeilnehmer = null; renderTeilnehmer();
    }));
    document.querySelectorAll('[data-cancelt]').forEach(b => b.addEventListener('click', () => { editTeilnehmer = null; renderTeilnehmer(); }));
    // Add
    on('nt-add', 'click', () => {
      const name = val('nt-name').trim();
      if (!name) { alert('Bitte einen Namen angeben.'); return; }
      State.addTeilnehmer({ typ: val('nt-typ'), name, einheit: val('nt-einheit'), hierarchie: val('nt-hier'), kontakt: val('nt-kontakt') });
    });
  }
  function teilViewRow(t) {
    return `<tr>
      <td>${t.typ === 'person' ? '👤' : '🏷️'}</td>
      <td>${esc(t.name)}</td><td>${esc(t.einheit || '')}</td><td>${esc(t.hierarchie || '')}</td>
      <td class="nowrap"><button class="mini blue" data-editt="${t.id}">✎</button><button class="mini" data-delt="${t.id}">✕</button></td>
    </tr>`;
  }
  function teilEditRow(t, d) {
    return `<tr class="editing">
      <td colspan="5">
        <div class="row">
          <select id="et-typ"><option value="person" ${t.typ === 'person' ? 'selected' : ''}>👤 Person</option><option value="thema" ${t.typ === 'thema' ? 'selected' : ''}>🏷️ Thema</option></select>
          <input id="et-name" value="${esc(t.name)}">
        </div>
        <div class="row">
          <input id="et-einheit" value="${esc(t.einheit || '')}" placeholder="Einheit">
          <select id="et-hier">${optsArr(d.hierarchie.map(h => h.ebene), t.hierarchie)}</select>
        </div>
        <input id="et-kontakt" value="${esc(t.kontakt || '')}" placeholder="Kontakt">
        <div class="row"><button class="btn primary" data-savet="${t.id}">✓ Speichern</button><button class="btn" data-cancelt="1">Abbrechen</button></div>
      </td></tr>`;
  }

  /* ---------------- Hierarchie-Pflege (editierbar) ---------------- */
  function renderHierarchie() {
    const box = document.getElementById('panel');
    const d = State.get();
    const sorted = [...d.hierarchie].sort((a, b) => (a.rang || 99) - (b.rang || 99));
    box.innerHTML = `
      <div class="manage">
        <h3>Hierarchie-Pflege</h3>
        <p class="hint">Rang 1 = oberste Ebene. Umbenennen wirkt in allen Elementen.</p>
        <table class="tbl">
          <thead><tr><th>Rang</th><th>Ebene</th><th>Kurz</th><th></th></tr></thead>
          <tbody>${sorted.map(h => editHierarchie === h.id ? hierEditRow(h) : hierViewRow(h)).join('')}</tbody>
        </table>
        <div class="add-form">
          <h4>Neue Ebene</h4>
          <div class="row">
            <input id="nh-ebene" placeholder="Bezeichnung">
            <input id="nh-rang" type="number" min="1" placeholder="Rang" style="max-width:80px">
            <input id="nh-kurz" placeholder="Kürzel" style="max-width:90px">
          </div>
          <button class="btn primary" id="nh-add">＋ Hinzufügen</button>
        </div>
      </div>`;
    document.querySelectorAll('[data-edith]').forEach(b => b.addEventListener('click', () => { editHierarchie = b.dataset.edith; renderHierarchie(); }));
    document.querySelectorAll('[data-delh]').forEach(b => b.addEventListener('click', () => State.deleteHierarchie(b.dataset.delh)));
    document.querySelectorAll('[data-saveh]').forEach(b => b.addEventListener('click', () => {
      State.updateHierarchie(b.dataset.saveh, { ebene: val('eh-ebene').trim(), rang: parseInt(val('eh-rang') || '99', 10), kurz: val('eh-kurz') });
      editHierarchie = null; renderHierarchie();
    }));
    document.querySelectorAll('[data-cancelh]').forEach(b => b.addEventListener('click', () => { editHierarchie = null; renderHierarchie(); }));
    on('nh-add', 'click', () => {
      const ebene = val('nh-ebene').trim();
      if (!ebene) { alert('Bitte eine Bezeichnung angeben.'); return; }
      State.addHierarchie({ ebene, rang: parseInt(val('nh-rang') || '99', 10), kurz: val('nh-kurz') });
    });
  }
  function hierViewRow(h) {
    return `<tr><td>${h.rang}</td><td>${esc(h.ebene)}</td><td>${esc(h.kurz || '')}</td>
      <td class="nowrap"><button class="mini blue" data-edith="${h.id}">✎</button><button class="mini" data-delh="${h.id}">✕</button></td></tr>`;
  }
  function hierEditRow(h) {
    return `<tr class="editing"><td colspan="4">
      <div class="row">
        <input id="eh-ebene" value="${esc(h.ebene)}">
        <input id="eh-rang" type="number" min="1" value="${h.rang || ''}" style="max-width:80px">
        <input id="eh-kurz" value="${esc(h.kurz || '')}" style="max-width:90px">
      </div>
      <div class="row"><button class="btn primary" data-saveh="${h.id}">✓ Speichern</button><button class="btn" data-cancelh="1">Abbrechen</button></div>
    </td></tr>`;
  }

  /* ---------------- Auswertung (Statistik + Matrix) ---------------- */
  function renderAuswertung() {
    const box = document.getElementById('panel');
    const d = State.get();
    const countBy = (keyFn) => { const m = {}; d.elemente.forEach(e => { const k = keyFn(e) || '—'; m[k] = (m[k] || 0) + 1; }); return m; };
    const aktionM = countBy(e => (AKTIONSARTEN[e.aktion] || {}).label || e.aktion);
    const medM = countBy(e => e.kanal);
    const hierM = countBy(e => e.hierarchie);
    const statusM = countBy(e => statusInfo(e.status).label);

    // Beteiligungs-Matrix: Teilnehmer × Aktionsart (Zuordnung ODER Teilnehmer)
    const namen = d.teilnehmer.map(t => t.name);
    const arten = Object.values(AKTIONSARTEN);
    const matrix = {};
    namen.forEach(n => matrix[n] = {});
    d.elemente.forEach(e => {
      const beteiligte = new Set([e.zuordnung, ...(e.teilnehmer || [])].filter(Boolean));
      beteiligte.forEach(n => { if (matrix[n]) matrix[n][e.aktion] = (matrix[n][e.aktion] || 0) + 1; });
    });

    box.innerHTML = `
      <div class="manage">
        <h3>Auswertung</h3>
        <p class="hint">${d.elemente.length} Elemente · ${d.verbindungen.length} Verbindungen · ${d.teilnehmer.length} Teilnehmer</p>
        <h4>Nach Status</h4>${barChart(statusM, key => (Object.values(STATUS).find(s => s.label === key) || {}).farbe || '#9aa7b8')}
        <h4>Nach Aktionsart</h4>${barChart(aktionM, key => (Object.values(AKTIONSARTEN).find(a => a.label === key) || {}).farbe || '#1e5aa8')}
        <h4>Nach Medium</h4>${barChart(medM, key => medium(key).farbe)}
        <h4>Nach Hierarchie-Ebene</h4>${barChart(hierM, () => '#0f3d73')}
        <h4>Beteiligungs-Matrix (Teilnehmer × Aktionsart)</h4>
        <div class="matrix-wrap">
          <table class="tbl matrix">
            <thead><tr><th>Teilnehmer</th>${arten.map(a => `<th title="${esc(a.label)}">${a.kuerzel}</th>`).join('')}</tr></thead>
            <tbody>
              ${namen.map(n => `<tr><td class="rowhead">${esc(n)}</td>${arten.map(a => {
                const c = (matrix[n][a.key] || 0);
                return `<td class="cell ${c ? 'has' : ''}" style="${c ? 'background:' + a.farbe + ';color:#fff' : ''}">${c || ''}</td>`;
              }).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }
  function barChart(map, colorFn) {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<p class="hint">Keine Daten.</p>';
    const max = Math.max(...entries.map(e => e[1]));
    return `<div class="bars">${entries.map(([k, v]) => `
      <div class="bar-row"><span class="bar-label">${esc(k)}</span>
        <span class="bar"><span class="bar-fill" style="width:${(v / max * 100)}%;background:${colorFn(k)}"></span></span>
        <span class="bar-val">${v}</span></div>`).join('')}</div>`;
  }

  /* ---------------- Plan-Tab (Meta + Verwaltung) ---------------- */
  function renderPlanTab() {
    const box = document.getElementById('panel');
    const d = State.get();
    const m = d.meta || {};
    box.innerHTML = `
      <div class="form">
        <h3>Plan-Eigenschaften</h3>
        <label>Plan-Name<input id="pl-name" value="${esc(d.name)}"></label>
        <label>Titel (Kopf)<input id="m-titel" value="${esc(m.titel || '')}"></label>
        <label>Behörde / Organisation<input id="m-behoerde" value="${esc(m.behoerde || '')}"></label>
        <div class="row">
          <label>Stand<input id="m-stand" value="${esc(m.stand || '')}" placeholder="JJJJ-MM-TT"></label>
          <label>Ersteller<input id="m-ersteller" value="${esc(m.ersteller || '')}"></label>
        </div>
        <p class="hint">Alle Änderungen werden automatisch gespeichert (localStorage). Pläne wechselst du oben links.</p>
      </div>`;
    bind('pl-name', 'input', v => State.renamePlan(State.aktivId(), v));
    bind('m-titel', 'input', v => State.updateMeta({ titel: v }));
    bind('m-behoerde', 'input', v => State.updateMeta({ behoerde: v }));
    bind('m-stand', 'input', v => State.updateMeta({ stand: v }));
    bind('m-ersteller', 'input', v => State.updateMeta({ ersteller: v }));
  }

  /* ---------------- Filterleiste ---------------- */
  function bindFilter() {
    const ids = ['flt-text', 'flt-aktion', 'flt-kanal', 'flt-status', 'flt-hier', 'flt-person'];
    const apply = () => Chart.setFilter({
      text: val('flt-text'), aktion: val('flt-aktion'), kanal: val('flt-kanal'),
      status: val('flt-status'), hierarchie: val('flt-hier'), person: val('flt-person')
    });
    // Optionen befüllen
    State.onChange(populateFilterOptions);
    populateFilterOptions();
    ids.forEach(id => on(id, id === 'flt-text' ? 'input' : 'change', apply));
    on('flt-clear', 'click', () => {
      ids.forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      apply();
    });
  }
  function populateFilterOptions() {
    const d = State.get();
    setOpts('flt-aktion', 'Alle Aktionsarten', Object.values(AKTIONSARTEN).map(a => a.label), Object.keys(AKTIONSARTEN), val('flt-aktion'));
    setOpts('flt-kanal', 'Alle Medien', KANAELE, KANAELE, val('flt-kanal'));
    setOpts('flt-status', 'Alle Status', Object.values(STATUS).map(s => s.label), Object.keys(STATUS), val('flt-status'));
    setOpts('flt-hier', 'Alle Ebenen', d.hierarchie.map(h => h.ebene), d.hierarchie.map(h => h.ebene), val('flt-hier'));
    setOpts('flt-person', 'Alle Personen/Themen', d.teilnehmer.map(t => t.name), d.teilnehmer.map(t => t.name), val('flt-person'));
  }
  function setOpts(id, allLabel, labels, values, keep) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = `<option value="">${allLabel}</option>` + labels.map((l, i) => `<option value="${esc(values[i])}" ${values[i] === keep ? 'selected' : ''}>${esc(l)}</option>`).join('');
  }

  /* ---------------- Meta & Legende ---------------- */
  function renderMeta() {
    const d = State.get();
    setText('plan-titel', (d.meta && d.meta.titel) || d.name || 'Kommunikationsplan');
    setText('plan-sub', `${(d.meta && d.meta.behoerde) || ''}${d.meta && d.meta.stand ? ' · Stand ' + d.meta.stand : ''}`);
  }
  function renderLegende() {
    const box = document.getElementById('legende');
    if (!box) return;
    box.innerHTML = Object.values(AKTIONSARTEN).map(a =>
      `<span class="leg-item" title="${esc(a.beschreibung)}"><span class="dot" style="background:${a.farbe}"></span>${esc(a.label)}</span>`).join('');
  }

  /* ---------------- Helfer ---------------- */
  function on(id, ev, fn) { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); }
  function bind(id, ev, fn) { const e = document.getElementById(id); if (e) e.addEventListener(ev, () => fn(e.value)); }
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function setText(id, t) { const e = document.getElementById(id); if (e) e.textContent = t; }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function optsArr(arr, sel) { return ['<option value="">— wählen —</option>'].concat(arr.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`)).join(''); }
  function optsObj(obj, sel, lbl) { return Object.values(obj).map(o => `<option value="${o.key}" ${o.key === sel ? 'selected' : ''}>${esc(lbl(o))}</option>`).join(''); }
  function optsMedien(sel) { return Object.keys(MEDIEN).map(k => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${medium(k).icon} ${esc(k)}</option>`).join(''); }
  function optsStatus(sel) { return Object.keys(STATUS).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(STATUS[k].label)}</option>`).join(''); }

  return { init };
})();

window.addEventListener('DOMContentLoaded', App.init);
