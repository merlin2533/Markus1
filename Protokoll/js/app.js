/* =========================================================================
   Kreditprotokoll – flexible HTML-Lösung
   Datengetrieben aus data/protocol-data.json (1:1 aus der Excel-Vorlage).
   ========================================================================= */
'use strict';

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'kreditprotokoll-state-v1';
const SECTION_MARK = '==='; // Trennmarke in der Rohausgabe

const State = {
  cover: { kundeTyp: '', kundenart: '', finanzierung: '' },
  header: { kreditnehmer: '', stammnummer: '', datum: '', berater: '', obligo: '' },
  // answers[nr] = { label: <gewählte Antwort>, begruendung: <Text|''> }
  answers: {},
  manualOutput: null,   // vom Nutzer manuell überschriebene Ausgabe (oder null)
  activeTab: null
};

let DATA = null;          // protocol-data.json
let Q_BY_NR = new Map();  // nr -> question

/* ----------------------------------------------------------------------- */
/* Initialisierung                                                          */
/* ----------------------------------------------------------------------- */
init();

async function init() {
  try {
    const res = await fetch('data/protocol-data.json');
    DATA = await res.json();
  } catch (e) {
    document.body.innerHTML = '<p style="padding:2rem">Konnte <code>data/protocol-data.json</code> nicht laden. ' +
      'Bitte die Seite über einen Webserver öffnen (z.&nbsp;B. <code>python -m http.server</code>).</p>';
    return;
  }
  DATA.questions.forEach(q => Q_BY_NR.set(q.nr, q));

  document.getElementById('appTitle').textContent = 'Kreditprotokoll';
  document.getElementById('appSub').textContent =
    `${DATA.meta.title} · Stand ${DATA.meta.stand}`;

  buildCoverSelects();
  bindEvents();
  restoreFromStorage();
  renderAll();
}

/* ----------------------------------------------------------------------- */
/* Cover-Auswahl                                                            */
/* ----------------------------------------------------------------------- */
function buildCoverSelects() {
  fillSelect('selKundeTyp', DATA.cover.kundeTyp);
  fillSelect('selKundenart', DATA.cover.kundenart);
  fillSelect('selFinanzierung', DATA.cover.finanzierung);
}

function fillSelect(id, values) {
  const sel = document.getElementById(id);
  sel.innerHTML = '<option value="">– bitte wählen –</option>' +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function currentVariant() {
  const { kundeTyp, kundenart, finanzierung } = State.cover;
  if (!kundeTyp || !kundenart || !finanzierung) return null;
  const key = `${kundeTyp}|${kundenart}|${finanzierung}`;
  return DATA.variantMatrix[key] ?? null;
}

/* ----------------------------------------------------------------------- */
/* Sichtbarkeit                                                            */
/* ----------------------------------------------------------------------- */
function isVisible(q, variant) {
  return variant != null && Array.isArray(q.variants) && q.variants.includes(variant);
}

function visibleQuestions(variant) {
  return DATA.questions.filter(q => isVisible(q, variant));
}

function sectionsWithQuestions(variant) {
  const vis = visibleQuestions(variant);
  return DATA.sections.filter(s => vis.some(q => q.section === s.id));
}

/* ----------------------------------------------------------------------- */
/* Rendering                                                                */
/* ----------------------------------------------------------------------- */
function renderAll() {
  syncCoverInputs();
  renderTabs();
  renderQuestions();
  rebuildOutput();
}

function syncCoverInputs() {
  document.getElementById('selKundeTyp').value = State.cover.kundeTyp;
  document.getElementById('selKundenart').value = State.cover.kundenart;
  document.getElementById('selFinanzierung').value = State.cover.finanzierung;
  document.getElementById('hdrKreditnehmer').value = State.header.kreditnehmer;
  document.getElementById('hdrStammnummer').value = State.header.stammnummer;
  document.getElementById('hdrDatum').value = State.header.datum;
  document.getElementById('hdrBerater').value = State.header.berater;
  document.getElementById('hdrObligo').value = State.header.obligo;

  const variant = currentVariant();
  const out = document.getElementById('variantInfo');
  if (variant == null) {
    out.textContent = State.cover.kundeTyp ? 'ungültige Kombination' : '–';
  } else {
    out.textContent = `Variante ${variant}`;
  }
}

function renderTabs() {
  const variant = currentVariant();
  const secs = DATA.sections;
  const visBySec = {};
  visibleQuestions(variant).forEach(q => { visBySec[q.section] = (visBySec[q.section] || 0) + 1; });

  const tabsEl = document.getElementById('tabs');
  const active = secs.find(s => s.id === State.activeTab && visBySec[s.id]) ||
                 secs.find(s => visBySec[s.id]);
  State.activeTab = active ? active.id : null;

  tabsEl.innerHTML = secs.map(s => {
    const count = visBySec[s.id] || 0;
    const cls = ['tab'];
    if (s.id === State.activeTab) cls.push('is-active');
    if (!count) cls.push('is-empty');
    return `<button type="button" class="${cls.join(' ')}" data-tab="${s.id}" ${count ? '' : 'disabled'}>
              ${esc(s.title)}${count ? `<span class="badge">${count}</span>` : ''}
            </button>`;
  }).join('');
}

function renderQuestions() {
  const variant = currentVariant();
  const container = document.getElementById('questionContainer');

  if (variant == null) {
    container.innerHTML = `<div class="card section-empty">
      Bitte zunächst <b>Neu-/Bestandskunde</b>, <b>Kundenart</b> und <b>Finanzierung</b> auswählen.</div>`;
    return;
  }

  const sec = DATA.sections.find(s => s.id === State.activeTab);
  if (!sec) {
    container.innerHTML = `<div class="card section-empty">Für diese Kombination sind keine Fragen hinterlegt.</div>`;
    return;
  }

  const qs = visibleQuestions(variant).filter(q => q.section === sec.id);
  container.innerHTML = `<div class="section-block">
      <div class="section-block__title">${esc(sec.title)}</div>
      ${qs.map(renderQuestion).join('')}
    </div>`;
}

function renderQuestion(q) {
  const state = State.answers[q.nr] || {};
  const selectable = q.answers.filter(a => !a.placeholder);
  const hasPlaceholder = q.answers.some(a => a.placeholder);

  const selectedLabel = state.label ?? defaultLabel(q);
  const selAns = selectable.find(a => a.label === selectedLabel) || null;
  const needsComment = !!(selAns && selAns.comment);
  const commentMissing = needsComment && !(state.begruendung || '').trim();
  const answered = !!selAns;

  const opts = (hasPlaceholder || !answered ? '<option value="">– bitte wählen –</option>' : '') +
    selectable.map(a =>
      `<option value="${esc(a.label)}" ${a.label === selectedLabel ? 'selected' : ''}>${esc(a.label)}</option>`
    ).join('');

  const qcls = ['q'];
  if (answered) qcls.push('is-answered');
  if (commentMissing) qcls.push('is-missing');

  return `<div class="${qcls.join(' ')}" data-nr="${esc(q.nr)}">
      <div class="q__head">
        <span class="q__nr">${esc(q.nr)}</span>
        <span class="q__text">${esc(q.frage)}</span>
      </div>
      ${q.hinweis ? `<div class="q__hint">ℹ️ ${esc(q.hinweis)}</div>` : ''}
      <div class="q__answer">
        <select data-role="answer" data-nr="${esc(q.nr)}">${opts}</select>
      </div>
      ${needsComment ? `
        <div class="q__comment is-required">
          <label>Begründung / Kommentar <span class="req-star">*Pflichtfeld</span></label>
          <textarea data-role="comment" data-nr="${esc(q.nr)}"
            placeholder="Bitte begründen …">${esc(state.begruendung || '')}</textarea>
        </div>` : ''}
    </div>`;
}

function defaultLabel(q) {
  const first = q.answers.find(a => !a.placeholder);
  return first ? first.label : null;
}

/* ----------------------------------------------------------------------- */
/* Ausgabe / Output                                                        */
/* ----------------------------------------------------------------------- */
function buildOutputStructure() {
  const variant = currentVariant();
  const result = [];
  if (variant == null) return result;

  for (const sec of sectionsWithQuestions(variant)) {
    const lines = [];
    for (const q of visibleQuestions(variant).filter(q => q.section === sec.id)) {
      const state = State.answers[q.nr] || {};
      const label = state.label ?? defaultLabel(q);
      const ans = q.answers.find(a => !a.placeholder && a.label === label);
      if (!ans || !ans.text) continue;
      lines.push(applyComment(ans, state.begruendung || ''));
    }
    if (lines.length) result.push({ title: sec.title, lines });
  }
  return result;
}

// Begründung in den Platzhalter (…/...) einsetzen bzw. anhängen.
function applyComment(ans, begruendung) {
  let text = ans.text;
  if (!ans.comment) return text;
  const b = (begruendung || '').trim();
  if (!b) return text;
  if (/(?:…|\.\.\.)/.test(text)) {
    return text.replace(/(?:…|\.\.\.)/, b); // erste Platzhalter-Stelle ersetzen
  }
  return text.replace(/\s*$/, '') + ' ' + b;
}

function structureToText(struct) {
  return struct.map(s =>
    `${SECTION_MARK} ${s.title} ${SECTION_MARK}\n${s.lines.join('\n')}`
  ).join('\n\n');
}

function rebuildOutput() {
  const struct = buildOutputStructure();
  const text = structureToText(struct);
  const ta = document.getElementById('outputText');
  if (!State.manualOutput) ta.value = text;
  renderValidation();
  renderPrintDoc(State.manualOutput ? parseTextToStructure(ta.value) : struct);
}

function parseTextToStructure(text) {
  const struct = [];
  let cur = null;
  text.split('\n').forEach(line => {
    const m = line.match(new RegExp('^' + SECTION_MARK + '\\s*(.*?)\\s*' + SECTION_MARK + '\\s*$'));
    if (m) { cur = { title: m[1], lines: [] }; struct.push(cur); }
    else if (cur) { cur.lines.push(line); }
    else { cur = { title: '', lines: [line] }; struct.push(cur); }
  });
  return struct;
}

function renderValidation() {
  const variant = currentVariant();
  const box = document.getElementById('validationHint');
  if (variant == null) { box.hidden = true; return; }

  const missing = [];
  for (const q of visibleQuestions(variant)) {
    const state = State.answers[q.nr] || {};
    const label = state.label ?? defaultLabel(q);
    const ans = q.answers.find(a => !a.placeholder && a.label === label);
    if (ans && ans.comment && !(state.begruendung || '').trim()) {
      missing.push(q.nr);
    }
  }
  if (!missing.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>Offene Pflicht-Begründungen (${missing.length}):</b>
    <ul><li>${missing.map(esc).join('</li><li>')}</li></ul>`;
}

function renderPrintDoc(struct) {
  const h = State.header;
  const variant = currentVariant();
  const variantTxt = variant == null ? '–' :
    `${variant} (${State.cover.kundeTyp} / ${State.cover.kundenart} / ${State.cover.finanzierung})`;

  const meta = [
    ['Kreditnehmer', h.kreditnehmer],
    ['Stammnummer', h.stammnummer],
    ['Datum', h.datum],
    ['Berater (KB)', h.berater],
    ['Obligo / Volumen', h.obligo],
    ['Variante', variantTxt]
  ].filter(([, v]) => v && String(v).trim())
   .map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('');

  const body = struct.map(s => `
    <div class="print-doc__section">
      <h2>${esc(s.title)}</h2>
      ${s.lines.filter(l => l.trim()).map(l => `<p>${esc(l)}</p>`).join('')}
    </div>`).join('');

  document.getElementById('printDoc').innerHTML = `
    <div class="print-doc__head">
      <h1>Kreditprotokoll</h1>
      <div>${esc(DATA.meta.title)} · Stand ${esc(DATA.meta.stand)}</div>
      <div class="print-doc__meta">${meta || '<div>—</div>'}</div>
    </div>
    ${body || '<p>Keine Angaben.</p>'}
    <div class="print-doc__foot">Erstellt am ${new Date().toLocaleDateString('de-DE')} · Kreditprotokoll (HTML)</div>`;
}

/* ----------------------------------------------------------------------- */
/* Events                                                                   */
/* ----------------------------------------------------------------------- */
function bindEvents() {
  document.getElementById('selKundeTyp').addEventListener('change', e => onCover('kundeTyp', e.target.value));
  document.getElementById('selKundenart').addEventListener('change', e => onCover('kundenart', e.target.value));
  document.getElementById('selFinanzierung').addEventListener('change', e => onCover('finanzierung', e.target.value));

  ['kreditnehmer', 'stammnummer', 'datum', 'berater', 'obligo'].forEach(k => {
    const id = 'hdr' + k.charAt(0).toUpperCase() + k.slice(1);
    document.getElementById(id).addEventListener('input', e => {
      State.header[k] = e.target.value; persist(); rebuildOutput();
    });
  });

  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab'); if (!btn || btn.disabled) return;
    State.activeTab = btn.dataset.tab; renderTabs(); renderQuestions();
  });

  const qc = document.getElementById('questionContainer');
  qc.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.role === 'answer') onAnswer(t.dataset.nr, t.value);
  });
  qc.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.role === 'comment') onComment(t.dataset.nr, t.value);
  });

  document.getElementById('btnRebuild').addEventListener('click', () => {
    State.manualOutput = null;
    document.getElementById('chkLiveEdit').checked = false;
    document.getElementById('outputText').readOnly = true;
    rebuildOutput(); persist();
  });
  document.getElementById('chkLiveEdit').addEventListener('change', e => {
    const ta = document.getElementById('outputText');
    ta.readOnly = !e.target.checked;
    if (e.target.checked) { State.manualOutput = ta.value; ta.focus(); }
    else { State.manualOutput = null; rebuildOutput(); }
    persist();
  });
  document.getElementById('outputText').addEventListener('input', e => {
    if (!e.target.readOnly) { State.manualOutput = e.target.value; renderPrintDoc(parseTextToStructure(e.target.value)); persist(); }
  });

  document.getElementById('btnCopy').addEventListener('click', copyOutput);
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  document.getElementById('btnSave').addEventListener('click', saveToFile);
  document.getElementById('btnLoad').addEventListener('click', () => document.getElementById('fileLoad').click());
  document.getElementById('fileLoad').addEventListener('change', loadFromFile);
  document.getElementById('btnReset').addEventListener('click', resetAll);
}

function onCover(key, value) {
  State.cover[key] = value;
  persist();
  renderAll();
}
function onAnswer(nr, label) {
  const q = Q_BY_NR.get(nr); if (!q) return;
  if (!State.answers[nr]) State.answers[nr] = {};
  State.answers[nr].label = label;
  // Begründung leeren, wenn neue Antwort keinen Kommentar braucht
  const ans = q.answers.find(a => !a.placeholder && a.label === label);
  if (!ans || !ans.comment) delete State.answers[nr].begruendung;
  persist();
  renderQuestions();
  rebuildOutput();
}
function onComment(nr, text) {
  if (!State.answers[nr]) State.answers[nr] = {};
  State.answers[nr].begruendung = text;
  persist();
  const q = document.querySelector(`.q[data-nr="${cssEsc(nr)}"]`);
  if (q) q.classList.toggle('is-missing', !text.trim());
  rebuildOutput();
}

/* ----------------------------------------------------------------------- */
/* Persistenz (localStorage)                                                */
/* ----------------------------------------------------------------------- */
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); } catch (e) {}
}
function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyImport(JSON.parse(raw), { silent: true });
  } catch (e) {}
}

/* ----------------------------------------------------------------------- */
/* Speichern / Laden als Datei                                              */
/* ----------------------------------------------------------------------- */
function serialize() {
  return {
    schemaVersion: SCHEMA_VERSION,
    typ: 'Kreditprotokoll',
    erstelltAm: new Date().toISOString(),
    cover: { ...State.cover },
    kopf: { ...State.header },
    antworten: buildAnswerExport(),
    manuelleAusgabe: State.manualOutput || undefined
  };
}

// Antworten exportieren – nur sinnvoll belegte
function buildAnswerExport() {
  const out = {};
  for (const [nr, st] of Object.entries(State.answers)) {
    if (!st || (st.label == null && !st.begruendung)) continue;
    const o = {};
    if (st.label != null) o.auswahl = st.label;
    if (st.begruendung) o.begruendung = st.begruendung;
    out[nr] = o;
  }
  return out;
}

function saveToFile() {
  const data = serialize();
  const name = (State.header.kreditnehmer || 'Kreditprotokoll')
    .replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Kreditprotokoll';
  const stamp = new Date().toISOString().slice(0, 10);
  download(`${name}_${stamp}.json`, JSON.stringify(data, null, 2));
  toast('Datensatz gespeichert.');
}

function loadFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(reader.result);
      const report = applyImport(obj, {});
      renderAll();
      toast(`Geladen: ${report.applied} Antwort(en) übernommen` +
        (report.skipped ? `, ${report.skipped} ignoriert` : '') + '.');
    } catch (err) {
      toast('Fehler: Datei ist kein gültiges JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ----------------------------------------------------------------------- */
/* ROBUSTER IMPORT                                                          */
/* Übernimmt ausschließlich Elemente, die zur internen Struktur passen.    */
/* ----------------------------------------------------------------------- */
function applyImport(obj, { silent } = {}) {
  const report = { applied: 0, skipped: 0 };
  if (!obj || typeof obj !== 'object') return report;

  // --- Cover (nur erlaubte Werte) ---
  if (obj.cover && typeof obj.cover === 'object') {
    matchInto(obj.cover.kundeTyp, DATA.cover.kundeTyp, v => State.cover.kundeTyp = v);
    matchInto(obj.cover.kundenart, DATA.cover.kundenart, v => State.cover.kundenart = v);
    matchInto(obj.cover.finanzierung, DATA.cover.finanzierung, v => State.cover.finanzierung = v);
  }

  // --- Kopfdaten (nur bekannte Felder, nur Strings) ---
  if (obj.kopf && typeof obj.kopf === 'object') {
    for (const k of Object.keys(State.header)) {
      if (typeof obj.kopf[k] === 'string') State.header[k] = obj.kopf[k];
    }
  }

  // --- Antworten (nur existierende Fragen & gültige Auswahl) ---
  const ant = obj.antworten || obj.answers;
  if (ant && typeof ant === 'object') {
    for (const [nr, val] of Object.entries(ant)) {
      const q = Q_BY_NR.get(nr);
      if (!q || !val || typeof val !== 'object') { report.skipped++; continue; }

      const wanted = val.auswahl ?? val.label ?? val.antwort;
      const ans = matchAnswer(q, wanted);
      if (!ans) { report.skipped++; continue; }

      const entry = { label: ans.label };
      const begr = val.begruendung ?? val.kommentar ?? val.comment;
      if (ans.comment && typeof begr === 'string' && begr.trim()) {
        entry.begruendung = begr;
      }
      State.answers[nr] = entry;
      report.applied++;
    }
  }

  // --- manuelle Ausgabe (optional) ---
  if (typeof obj.manuelleAusgabe === 'string') State.manualOutput = obj.manuelleAusgabe;

  if (!silent && report.applied === 0 && report.skipped === 0) {
    toast('Keine passenden Daten im Import gefunden.');
  }
  return report;
}

// Antwort tolerant zuordnen: exakt → trimmed/case-insensitive → Präfix
function matchAnswer(q, wanted) {
  if (wanted == null) return null;
  const sel = q.answers.filter(a => !a.placeholder);
  const w = String(wanted).trim().toLowerCase();
  return sel.find(a => a.label === wanted)
      || sel.find(a => a.label.trim().toLowerCase() === w)
      || sel.find(a => a.label.trim().toLowerCase().startsWith(w) && w.length >= 4)
      || sel.find(a => w.startsWith(a.label.trim().toLowerCase()) && a.label.trim().length >= 4)
      || null;
}

function matchInto(value, allowed, setter) {
  if (value == null) return;
  const v = String(value).trim().toLowerCase();
  const hit = allowed.find(a => a.toLowerCase() === v);
  if (hit) setter(hit);
}

/* ----------------------------------------------------------------------- */
/* Zurücksetzen                                                             */
/* ----------------------------------------------------------------------- */
function resetAll() {
  if (!confirm('Alle Eingaben verwerfen und neu beginnen?')) return;
  State.cover = { kundeTyp: '', kundenart: '', finanzierung: '' };
  State.header = { kreditnehmer: '', stammnummer: '', datum: '', berater: '', obligo: '' };
  State.answers = {};
  State.manualOutput = null;
  State.activeTab = null;
  document.getElementById('chkLiveEdit').checked = false;
  document.getElementById('outputText').readOnly = true;
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
  toast('Zurückgesetzt.');
}

/* ----------------------------------------------------------------------- */
/* Hilfsfunktionen                                                          */
/* ----------------------------------------------------------------------- */
function copyOutput() {
  const ta = document.getElementById('outputText');
  const text = ta.value;
  const done = () => toast('Protokoll in die Zwischenablage kopiert.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(ta, done));
  } else { fallbackCopy(ta, done); }
}
function fallbackCopy(ta, done) {
  const ro = ta.readOnly; ta.readOnly = false; ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Kopieren nicht möglich.'); }
  ta.readOnly = ro; window.getSelection().removeAllRanges();
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
