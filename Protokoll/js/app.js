/* =========================================================================
   Kreditprotokoll – flexible HTML-Lösung
   Datengetrieben aus data/protocol-data.json (1:1 aus der Excel-Vorlage).
   Limits je Reiter aus config.json.
   ========================================================================= */
'use strict';

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'kreditprotokoll-state-v1';
const BAUSTEINE_KEY = 'kreditprotokoll-bausteine-v1';
const COLLAPSE_KEY = 'kreditprotokoll-collapse-v1';

// Farbpalette je Abschnitt (Output & Druck)
const SECTION_COLORS = {
  person: '#0b5d8a', vorhaben: '#1d8a5b', entwicklung: '#9a6a12',
  liquiditaet: '#6a3da6', rating: '#b4471c', sicherheit: '#0b768a',
  votum: '#2d6a2d', entscheidung: '#8a2d4f', kompakt: '#084766'
};
function sectionColor(id) { return SECTION_COLORS[id] || '#0b5d8a'; }

const DEFAULT_CONFIG = {
  zeichenLimits: { default: 2000 },
  warnAbProzent: 90
};

const State = {
  cover: { kundeTyp: '', kundenart: '', finanzierung: '' },
  header: { kreditnehmer: '', stammnummer: '', datum: '', berater: '', bearbeiter: '', obligo: '', bemerkung: '' },
  // answers[nr] = { label, begruendung }
  answers: {},
  bausteine: {}, // nr -> [Standard-Begruendungen]
  manualSections: {}, // secId -> manuell bearbeiteter Text
  editMode: false,
  activeTab: null
};

let DATA = null;          // protocol-data.json
let CONFIG = DEFAULT_CONFIG;
let Q_BY_NR = new Map();  // nr -> question
let SECTION_IDS = new Set();

init();

/* ----------------------------------------------------------------------- */
/* Initialisierung                                                          */
/* ----------------------------------------------------------------------- */
async function init() {
  try {
    const res = await fetch('data/protocol-data.json');
    DATA = await res.json();
  } catch (e) {
    document.body.innerHTML = '<p style="padding:2rem">Konnte <code>data/protocol-data.json</code> nicht laden. ' +
      'Bitte die Seite über einen Webserver öffnen (z.&nbsp;B. <code>python -m http.server</code>).</p>';
    return;
  }
  // Config (optional, mit Fallback)
  try {
    const cres = await fetch('config.json');
    if (cres.ok) {
      const c = await cres.json();
      CONFIG = {
        zeichenLimits: Object.assign({ default: 2000 }, c.zeichenLimits || {}),
        warnAbProzent: Number(c.warnAbProzent) || 90
      };
    }
  } catch (e) { /* Fallback bleibt */ }

  DATA.questions.forEach(q => Q_BY_NR.set(q.nr, q));
  DATA.sections.forEach(s => SECTION_IDS.add(s.id));

  document.getElementById('appTitle').textContent = 'Kreditprotokoll';
  document.getElementById('appSub').textContent =
    `${DATA.meta.title} · Stand ${DATA.meta.stand}`;

  // Textbausteine: zuerst Datei im Ordner, dann lokal Gespeichertes (überschreibt/ergänzt)
  try {
    const bres = await fetch('bausteine.json');
    if (bres.ok) mergeBausteine((await bres.json()).bausteine);
  } catch (e) { /* optional */ }
  try {
    const raw = localStorage.getItem(BAUSTEINE_KEY);
    if (raw) mergeBausteine(JSON.parse(raw));
  } catch (e) { /* optional */ }

  buildCoverSelects();
  bindEvents();
  applyCollapse();
  restoreFromStorage();
  updateBsStatus();
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
  return DATA.variantMatrix[`${kundeTyp}|${kundenart}|${finanzierung}`] ?? null;
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
  document.getElementById('hdrBearbeiter').value = State.header.bearbeiter;
  document.getElementById('hdrObligo').value = State.header.obligo;
  document.getElementById('hdrBemerkung').value = State.header.bemerkung;
  document.getElementById('chkLiveEdit').checked = State.editMode;

  const variant = currentVariant();
  const out = document.getElementById('variantInfo');
  out.textContent = variant == null
    ? (State.cover.kundeTyp ? 'ungültige Kombination' : '–')
    : `Variante ${variant}`;
}

function renderTabs() {
  const variant = currentVariant();
  const visBySec = {};
  visibleQuestions(variant).forEach(q => { visBySec[q.section] = (visBySec[q.section] || 0) + 1; });

  const tabsEl = document.getElementById('tabs');
  const active = DATA.sections.find(s => s.id === State.activeTab && visBySec[s.id]) ||
                 DATA.sections.find(s => visBySec[s.id]);
  State.activeTab = active ? active.id : null;

  tabsEl.innerHTML = DATA.sections.map(s => {
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
  const tabs = sectionsWithQuestions(variant);
  const idx = tabs.findIndex(s => s.id === sec.id);
  const prev = tabs[idx - 1], next = tabs[idx + 1];

  const nav = `<div class="nav-buttons">
      ${prev ? `<button type="button" class="btn btn--prev" data-nav="prev">← ${esc(prev.title)}</button>` : '<span></span>'}
      ${next
        ? `<button type="button" class="btn btn--next" data-nav="next">Weiter: ${esc(next.title)} →</button>`
        : `<button type="button" class="btn btn--next btn--done" data-nav="done">✓ Fertig – zur Ausgabe</button>`}
    </div>`;

  container.innerHTML = `<div class="section-block">
      <div class="section-block__title">${esc(sec.title)}</div>
      ${qs.map(renderQuestion).join('')}
      ${nav}
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
          ${renderBausteine(q.nr)}
          <label>Begründung / Kommentar <span class="req-star">*Pflichtfeld</span></label>
          <textarea data-role="comment" data-nr="${esc(q.nr)}"
            placeholder="Bitte begründen … (Strg+Enter = weiter)">${esc(state.begruendung || '')}</textarea>
        </div>` : ''}
    </div>`;
}

function defaultLabel(q) {
  const first = q.answers.find(a => !a.placeholder);
  return first ? first.label : null;
}

// Textbausteine je Frage als anklickbare Chips
function renderBausteine(nr) {
  const list = State.bausteine[nr];
  if (!Array.isArray(list) || !list.length) return '';
  const chips = list.map((t, i) =>
    `<button type="button" class="chip" data-baustein="${esc(nr)}" data-idx="${i}" title="${esc(t)}">
       <span class="chip__txt">＋ ${esc(t)}</span>
     </button>`).join('');
  return `<div class="q__bausteine">
      <span class="q__bausteine-lbl">Standardbausteine (Klick zum Einfügen):</span>
      <div class="q__chips">${chips}</div>
    </div>`;
}

/* ----------------------------------------------------------------------- */
/* Ausgabe – reiterweise, mit Limit & Auto-Split                            */
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
    if (lines.length || State.manualSections[sec.id] != null) {
      result.push({ id: sec.id, title: sec.title, lines });
    }
  }
  return result;
}

function applyComment(ans, begruendung) {
  if (!ans.comment) return ans.text;
  const b = (begruendung || '').trim();
  if (!b) return ans.text;
  if (/(?:…|\.\.\.)/.test(ans.text)) return ans.text.replace(/(?:…|\.\.\.)/, b);
  return ans.text.replace(/\s*$/, '') + ' ' + b;
}

function sectionText(s) {
  return State.manualSections[s.id] != null ? State.manualSections[s.id] : s.lines.join('\n');
}
function limitFor(secId) {
  const L = CONFIG.zeichenLimits || {};
  const v = (secId in L) ? L[secId] : L.default;
  return Number(v) > 0 ? Number(v) : 0;
}

// Text am Limit in N Teile aufteilen (an Zeilengrenzen, sonst hart).
function splitIntoParts(text, limit) {
  if (!limit || text.length <= limit) return [text];
  const lines = text.split('\n');
  const parts = [];
  let cur = '';
  const push = () => { if (cur !== '') { parts.push(cur); cur = ''; } };
  for (const line of lines) {
    const cand = cur ? cur + '\n' + line : line;
    if (cand.length <= limit) { cur = cand; continue; }
    push();
    if (line.length <= limit) { cur = line; }
    else {
      let rest = line;
      while (rest.length > limit) { parts.push(rest.slice(0, limit)); rest = rest.slice(limit); }
      cur = rest;
    }
  }
  push();
  return parts.length ? parts : [''];
}

function levelClasses(len, limit) {
  if (!limit) return { txt: '', bar: '' };
  const pct = len / limit * 100;
  if (len > limit) return { txt: 'is-over', bar: 'is-over' };
  if (pct >= CONFIG.warnAbProzent) return { txt: 'is-warn', bar: 'is-warn' };
  return { txt: '', bar: '' };
}

function rebuildOutput() {
  const struct = buildOutputStructure();
  const host = document.getElementById('outputSections');

  if (!struct.length) {
    host.innerHTML = `<div class="out-empty">Noch keine Ausgabe – bitte Auswahl treffen und Fragen beantworten.</div>`;
    renderValidation();
    renderPrintDoc([]);
    return;
  }

  host.innerHTML = struct.map(s => {
    const text = sectionText(s);
    const limit = limitFor(s.id);
    const len = text.length;
    const lvl = levelClasses(len, limit);
    const pct = limit ? Math.min(100, len / limit * 100) : 0;
    const over = limit && len > limit;

    let body;
    if (State.editMode) {
      body = `<textarea class="out-text" data-edit="${esc(s.id)}" spellcheck="false">${esc(text)}</textarea>`;
    } else {
      const parts = splitIntoParts(text, limit);
      if (parts.length <= 1) {
        body = `<div class="out-part">
            <div class="out-part__head">
              <span class="out-part__count ${over ? 'is-over' : ''}">${len} Zeichen</span>
              <button type="button" class="btn-copy" data-copytext>📋 Kopieren</button>
            </div>
            <textarea class="out-text" readonly>${esc(text)}</textarea>
          </div>`;
      } else {
        body = `<div class="out-split-note">Über Limit (${limit}) – automatisch in ${parts.length} Teile aufgeteilt (jeder Teil einzeln kopierbar).</div>` +
          parts.map((p, i) => `<div class="out-part">
              <div class="out-part__head">
                <span class="out-part__label">Teil ${i + 1}/${parts.length}</span>
                <span class="out-part__count ${p.length > limit ? 'is-over' : ''}">${p.length} Zeichen</span>
                <button type="button" class="btn-copy" data-copytext>📋 Kopieren</button>
              </div>
              <textarea class="out-text" readonly>${esc(p)}</textarea>
            </div>`).join('');
      }
    }

    const countLbl = `${len}${limit ? ` / ${limit}` : ''} Zeichen${over ? ` · ${len - limit} zu viel` : ''}`;
    return `<div class="out-section ${s.id === State.activeTab ? 'is-active' : ''}" data-sec="${esc(s.id)}" style="--sec-color:${sectionColor(s.id)}">
        <div class="out-section__head">
          <span class="out-section__title">${esc(s.title)}</span>
          <span class="out-section__count ${lvl.txt}" data-count="${esc(s.id)}">${countLbl}</span>
          <button type="button" class="btn-copy" data-copysec="${esc(s.id)}">📋 Abschnitt</button>
        </div>
        ${limit ? `<div class="out-meter"><div class="out-meter__bar ${lvl.bar}" data-meter="${esc(s.id)}" style="width:${pct}%"></div></div>` : ''}
        ${body}
      </div>`;
  }).join('');

  host.querySelectorAll('.out-text').forEach(autoSize);
  renderValidation();
  renderPrintDoc(struct);
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
    if (ans && ans.comment && !(state.begruendung || '').trim()) missing.push(q.nr);
  }
  if (!missing.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>Offene Pflicht-Begründungen (${missing.length}):</b>
    <div class="vh-chips">${missing.map(nr =>
      `<button type="button" class="vh-chip" data-goto="${esc(nr)}">${esc(nr)}</button>`).join('')}</div>`;
}

// Auto-Höhe für Ausgabe-Textfelder (keine inneren Scrollbalken)
function autoSize(ta) {
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

// Direkt zu einer Frage springen (aus der Pflicht-Begründungs-Liste)
function gotoQuestion(nr) {
  const q = Q_BY_NR.get(nr);
  if (!q) return;
  setActiveTab(q.section, { scroll: false });
  requestAnimationFrame(() => {
    const el = document.querySelector(`.q[data-nr="${cssEsc(nr)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('q--flash');
    setTimeout(() => el.classList.remove('q--flash'), 1500);
    const ta = el.querySelector('textarea[data-role="comment"]');
    if (ta) ta.focus();
  });
}

function renderPrintDoc(struct) {
  const h = State.header;
  const variant = currentVariant();
  const variantTxt = variant == null ? '–' :
    `${variant} (${State.cover.kundeTyp} / ${State.cover.kundenart} / ${State.cover.finanzierung})`;

  const meta = [
    ['Kreditnehmer', h.kreditnehmer], ['Stammnummer', h.stammnummer],
    ['Datum', h.datum], ['Berater (KB)', h.berater],
    ['Bearbeiter', h.bearbeiter], ['Obligo / Volumen', h.obligo],
    ['Variante', variantTxt], ['Bemerkung', h.bemerkung]
  ].filter(([, v]) => v && String(v).trim())
   .map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('');

  const body = struct.map(s => {
    const lines = sectionText(s).split('\n').filter(l => l.trim());
    return `<div class="print-doc__section" style="--sec-color:${sectionColor(s.id)}">
        <h2>${esc(s.title)}</h2>
        ${lines.map(l => `<p>${esc(l)}</p>`).join('')}
      </div>`;
  }).join('');

  document.getElementById('printDoc').innerHTML = `
    <div class="print-doc__head">
      <h1>Kreditprotokoll</h1>
      <div class="sub">${esc(DATA.meta.title)} · Stand ${esc(DATA.meta.stand)}</div>
      <div class="print-doc__meta">${meta || '<div>—</div>'}</div>
    </div>
    ${body || '<p>Keine Angaben.</p>'}
    <div class="print-doc__foot">
      <span>${esc(h.bearbeiter ? 'Bearbeiter: ' + h.bearbeiter : 'Kreditprotokoll (HTML)')}</span>
      <span>Erstellt am ${new Date().toLocaleDateString('de-DE')}</span>
    </div>`;
}

/* ----------------------------------------------------------------------- */
/* Navigation & Tastatursteuerung                                           */
/* ----------------------------------------------------------------------- */
function setActiveTab(id, { scroll = true } = {}) {
  if (!id) return;
  State.activeTab = id;
  renderTabs();
  renderQuestions();
  // aktiven Ausgabe-Abschnitt markieren
  document.querySelectorAll('.out-section').forEach(el =>
    el.classList.toggle('is-active', el.dataset.sec === id));
  if (scroll) document.querySelector('.layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function stepTab(dir) {
  const tabs = sectionsWithQuestions(currentVariant());
  if (!tabs.length) return;
  let i = tabs.findIndex(s => s.id === State.activeTab);
  i = Math.max(0, Math.min(tabs.length - 1, (i < 0 ? 0 : i) + dir));
  setActiveTab(tabs[i].id);
  const first = document.querySelector('#questionContainer select[data-role="answer"]');
  if (first) first.focus();
}
function answerSelects() {
  return [...document.querySelectorAll('#questionContainer select[data-role="answer"]')];
}
function stepQuestion(dir) {
  const sels = answerSelects();
  if (!sels.length) return;
  const cur = document.activeElement;
  let i = sels.indexOf(cur);
  if (i === -1) { (dir > 0 ? sels[0] : sels[sels.length - 1]).focus(); return; }
  const ni = i + dir;
  if (ni < 0) return;
  if (ni >= sels.length) { stepTab(1); return; }
  sels[ni].focus();
}
function focusComment(nr) {
  const el = document.querySelector(`#questionContainer textarea[data-role="comment"][data-nr="${cssEsc(nr)}"]`);
  if (el) { el.focus(); }
}
function focusNextAfter(nr) {
  const sels = answerSelects();
  const cur = sels.find(s => s.dataset.nr === nr);
  const i = sels.indexOf(cur);
  if (i >= 0 && i + 1 < sels.length) sels[i + 1].focus();
}

/* ----------------------------------------------------------------------- */
/* Events                                                                   */
/* ----------------------------------------------------------------------- */
function bindEvents() {
  document.getElementById('selKundeTyp').addEventListener('change', e => onCover('kundeTyp', e.target.value));
  document.getElementById('selKundenart').addEventListener('change', e => onCover('kundenart', e.target.value));
  document.getElementById('selFinanzierung').addEventListener('change', e => onCover('finanzierung', e.target.value));

  ['kreditnehmer', 'stammnummer', 'datum', 'berater', 'bearbeiter', 'obligo', 'bemerkung'].forEach(k => {
    const id = 'hdr' + k.charAt(0).toUpperCase() + k.slice(1);
    document.getElementById(id).addEventListener('input', e => {
      State.header[k] = e.target.value; persist(); renderPrintDoc(buildOutputStructure());
    });
  });

  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab'); if (!btn || btn.disabled) return;
    setActiveTab(btn.dataset.tab);
  });

  const qc = document.getElementById('questionContainer');
  qc.addEventListener('change', e => {
    if (e.target.dataset.role === 'answer') onAnswer(e.target.dataset.nr, e.target.value);
  });
  qc.addEventListener('input', e => {
    if (e.target.dataset.role === 'comment') onComment(e.target.dataset.nr, e.target.value);
  });
  qc.addEventListener('click', e => {
    const chip = e.target.closest('[data-baustein]');
    if (chip) { insertBaustein(chip.dataset.baustein, +chip.dataset.idx); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) handleNav(nav.dataset.nav);
  });
  // Enter = weiter
  qc.addEventListener('keydown', e => {
    const t = e.target;
    if (t.dataset.role === 'answer' && e.key === 'Enter') {
      e.preventDefault();
      const q = Q_BY_NR.get(t.dataset.nr);
      const ans = q && q.answers.find(a => !a.placeholder && a.label === t.value);
      if (ans && ans.comment) focusComment(t.dataset.nr); else focusNextAfter(t.dataset.nr);
    } else if (t.dataset.role === 'comment' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      focusNextAfter(t.dataset.nr);
    }
  });

  // Ausgabe: kopieren & bearbeiten (Delegation)
  const host = document.getElementById('outputSections');
  host.addEventListener('click', e => {
    const sec = e.target.closest('[data-copysec]');
    if (sec) { copySectionById(sec.dataset.copysec); return; }
    const part = e.target.closest('[data-copytext]');
    if (part) {
      const ta = part.closest('.out-part').querySelector('textarea');
      if (ta) copyText(ta.value);
    }
  });
  host.addEventListener('input', e => {
    const ed = e.target.dataset.edit;
    if (ed != null) onSectionEdit(ed, e.target.value);
  });

  document.getElementById('btnRebuild').addEventListener('click', () => {
    State.manualSections = {}; State.editMode = false;
    document.getElementById('chkLiveEdit').checked = false;
    rebuildOutput(); persist(); toast('Ausgabe neu aufgebaut.');
  });
  document.getElementById('chkLiveEdit').addEventListener('change', e => {
    State.editMode = e.target.checked; rebuildOutput(); persist();
  });

  // Textbausteine
  document.getElementById('btnBsGen').addEventListener('click', () => document.getElementById('fileBsGen').click());
  document.getElementById('fileBsGen').addEventListener('change', generateBausteineFromFiles);
  document.getElementById('btnBsLoad').addEventListener('click', () => document.getElementById('fileBsLoad').click());
  document.getElementById('fileBsLoad').addEventListener('change', loadBausteineFile);
  document.getElementById('btnBsSave').addEventListener('click', saveBausteine);
  document.getElementById('btnBsClear').addEventListener('click', clearBausteine);

  // Klick auf offene Pflicht-Begründung -> zur Frage springen
  document.getElementById('validationHint').addEventListener('click', e => {
    const c = e.target.closest('[data-goto]'); if (c) gotoQuestion(c.dataset.goto);
  });

  // Einklappbare Karten
  document.querySelectorAll('[data-collapse]').forEach(btn =>
    btn.addEventListener('click', () => {
      btn.closest('.card').classList.toggle('is-collapsed'); saveCollapse();
    }));

  // KI-Export-Dialog
  document.getElementById('btnKi').addEventListener('click', openKiModal);
  document.querySelectorAll('[data-close-ki]').forEach(el => el.addEventListener('click', closeKiModal));
  document.querySelectorAll('.ki-tab').forEach(t =>
    t.addEventListener('click', () => switchKiTab(t.dataset.kitab)));
  document.getElementById('btnKiCopyFragen').addEventListener('click',
    () => copyText(document.getElementById('kiFragen').value, 'Fragenliste kopiert.'));
  document.getElementById('btnKiCopyPrompt').addEventListener('click',
    () => copyText(document.getElementById('kiPrompt').value, 'KI-Prompt kopiert.'));

  document.getElementById('btnCopyAll').addEventListener('click', copyAll);
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  document.getElementById('btnSave').addEventListener('click', saveToFile);
  document.getElementById('btnLoad').addEventListener('click', () => document.getElementById('fileLoad').click());
  document.getElementById('fileLoad').addEventListener('change', loadFromFile);
  document.getElementById('btnReset').addEventListener('click', resetAll);

  // Globale Tastatursteuerung
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('kiModal').hidden) { closeKiModal(); return; }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') { e.preventDefault(); stepTab(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepTab(-1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepQuestion(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepQuestion(-1); }
    else if (k === 'c') { e.preventDefault(); copySectionById(State.activeTab); }
    else if (k === 'p') { e.preventDefault(); window.print(); }
  });
}

function handleNav(dir) {
  const tabs = sectionsWithQuestions(currentVariant());
  const i = tabs.findIndex(s => s.id === State.activeTab);
  if (dir === 'prev' && tabs[i - 1]) setActiveTab(tabs[i - 1].id);
  else if (dir === 'next' && tabs[i + 1]) setActiveTab(tabs[i + 1].id);
  else if (dir === 'done') {
    document.getElementById('outputPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const b = document.querySelector(`.out-section[data-sec="${cssEsc(State.activeTab)}"] .btn-copy`);
    if (b) b.focus();
  }
  if (dir !== 'done') {
    const first = document.querySelector('#questionContainer select[data-role="answer"]');
    if (first) first.focus();
  }
}

function onCover(key, value) { State.cover[key] = value; persist(); renderAll(); }

function onAnswer(nr, label) {
  const q = Q_BY_NR.get(nr); if (!q) return;
  if (!State.answers[nr]) State.answers[nr] = {};
  State.answers[nr].label = label;
  const ans = q.answers.find(a => !a.placeholder && a.label === label);
  if (!ans || !ans.comment) delete State.answers[nr].begruendung;
  persist();
  renderQuestions();
  rebuildOutput();
  if (ans && ans.comment) focusComment(nr); else focusNextAfter(nr);
}

function onComment(nr, text) {
  if (!State.answers[nr]) State.answers[nr] = {};
  State.answers[nr].begruendung = text;
  persist();
  const qEl = document.querySelector(`.q[data-nr="${cssEsc(nr)}"]`);
  if (qEl) qEl.classList.toggle('is-missing', !text.trim());
  rebuildOutput();
}

// Live-Bearbeitung eines Ausgabe-Abschnitts: nur Zähler/Meter live aktualisieren
function onSectionEdit(secId, value) {
  State.manualSections[secId] = value;
  const ta = document.querySelector(`[data-edit="${cssEsc(secId)}"]`);
  if (ta) autoSize(ta);
  const limit = limitFor(secId);
  const len = value.length;
  const lvl = levelClasses(len, limit);
  const cnt = document.querySelector(`[data-count="${cssEsc(secId)}"]`);
  if (cnt) {
    const over = limit && len > limit;
    cnt.textContent = `${len}${limit ? ` / ${limit}` : ''} Zeichen${over ? ` · ${len - limit} zu viel` : ''}`;
    cnt.className = `out-section__count ${lvl.txt}`;
  }
  const bar = document.querySelector(`[data-meter="${cssEsc(secId)}"]`);
  if (bar && limit) { bar.style.width = Math.min(100, len / limit * 100) + '%'; bar.className = `out-meter__bar ${lvl.bar}`; }
  persist();
  renderPrintDoc(buildOutputStructure());
}

/* ----------------------------------------------------------------------- */
/* Kopieren                                                                 */
/* ----------------------------------------------------------------------- */
function copySectionById(secId) {
  const s = buildOutputStructure().find(x => x.id === secId);
  if (!s) { toast('Kein Inhalt zum Kopieren.'); return; }
  const limit = limitFor(secId);
  const text = sectionText(s);
  const parts = State.editMode ? [text] : splitIntoParts(text, limit);
  copyText(text, parts.length > 1
    ? `Abschnitt kopiert (Achtung: über Limit – ${parts.length} Teile verfügbar).`
    : 'Abschnitt kopiert.');
}
function copyAll() {
  const struct = buildOutputStructure();
  if (!struct.length) { toast('Keine Ausgabe vorhanden.'); return; }
  const all = struct.map(s => `=== ${s.title} ===\n${sectionText(s)}`).join('\n\n');
  copyText(all, 'Gesamte Ausgabe kopiert.');
}
function copyText(text, msg) {
  const done = () => toast(msg || 'Kopiert.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => legacyCopy(text, done));
  } else legacyCopy(text, done);
}
function legacyCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Kopieren nicht möglich.'); }
  ta.remove();
}

/* ----------------------------------------------------------------------- */
/* Textbausteine (Standard-Begründungen)                                    */
/* ----------------------------------------------------------------------- */
function insertBaustein(nr, idx) {
  const list = State.bausteine[nr];
  if (!Array.isArray(list) || list[idx] == null) return;
  const text = list[idx];
  const ta = document.querySelector(`#questionContainer textarea[data-role="comment"][data-nr="${cssEsc(nr)}"]`);
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  const sep = (before && !/\s$/.test(before)) ? ' ' : '';
  const ins = sep + text;
  ta.value = before + ins + after;
  const caret = before.length + ins.length;
  onComment(nr, ta.value);
  ta.focus();
  try { ta.setSelectionRange(caret, caret); } catch (e) {}
}

// Nur gültige Einträge übernehmen: bekannte Fragenummern, nicht-leere Strings, dedupliziert
function mergeBausteine(map) {
  if (!map || typeof map !== 'object') return 0;
  let added = 0;
  for (const [nr, arr] of Object.entries(map)) {
    if (!Q_BY_NR.has(nr) || !Array.isArray(arr)) continue;
    const cur = State.bausteine[nr] || [];
    for (const t of arr) {
      if (typeof t !== 'string') continue;
      const s = t.trim();
      if (s && !cur.includes(s)) { cur.push(s); added++; }
    }
    if (cur.length) State.bausteine[nr] = cur;
  }
  return added;
}

function updateBsStatus() {
  const nQ = Object.keys(State.bausteine).length;
  const nB = Object.values(State.bausteine).reduce((a, x) => a + x.length, 0);
  const el = document.getElementById('bsStatus');
  if (!el) return;
  el.textContent = nB ? `${nB} Bausteine zu ${nQ} Frage(n) geladen` : 'keine Bausteine geladen';
  el.classList.toggle('is-on', nB > 0);
}

async function generateBausteineFromFiles(e) {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    try {
      const obj = JSON.parse(await f.text());
      if (obj && obj.bausteine) added += mergeBausteine(obj.bausteine);
      const ant = obj && (obj.antworten || obj.answers);
      if (ant && typeof ant === 'object') {
        const map = {};
        for (const [nr, v] of Object.entries(ant)) {
          if (!Q_BY_NR.has(nr) || !v) continue;
          const b = v.begruendung ?? v.kommentar ?? v.comment;
          if (typeof b === 'string' && b.trim()) (map[nr] = map[nr] || []).push(b.trim());
        }
        added += mergeBausteine(map);
      }
    } catch (err) { /* ungültige Datei überspringen */ }
  }
  persistBausteine(); updateBsStatus(); renderQuestions();
  toast(`${added} Baustein(e) aus ${files.length} Datei(en) ergänzt.`);
  if (added && confirm('Bausteine wurden generiert. Jetzt als Datei speichern?')) saveBausteine();
}

function loadBausteineFile(e) {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  file.text().then(txt => {
    try {
      const obj = JSON.parse(txt);
      const added = mergeBausteine(obj.bausteine || obj);
      persistBausteine(); updateBsStatus(); renderQuestions();
      toast(added ? `${added} Baustein(e) geladen.` : 'Keine passenden Bausteine gefunden.');
    } catch (err) { toast('Fehler: keine gültige Bausteine-Datei.'); }
  });
}

function saveBausteine() {
  if (!Object.keys(State.bausteine).length) { toast('Keine Bausteine vorhanden.'); return; }
  let name = (prompt('Dateiname für die Bausteine-Datei:', 'bausteine') || 'bausteine')
    .replace(/[^\wäöüÄÖÜß\- .]+/g, '').trim() || 'bausteine';
  if (!name.toLowerCase().endsWith('.json')) name += '.json';
  const data = {
    typ: 'Kreditprotokoll-Bausteine', schemaVersion: SCHEMA_VERSION,
    erstelltAm: new Date().toISOString(), bausteine: State.bausteine
  };
  download(name, JSON.stringify(data, null, 2));
  toast('Bausteine gespeichert. Tipp: als bausteine.json im Ordner ablegen → Auto-Laden.');
}

function clearBausteine() {
  if (!confirm('Alle geladenen Bausteine entfernen? (Eine vorhandene Datei bleibt erhalten.)')) return;
  State.bausteine = {}; persistBausteine(); updateBsStatus(); renderQuestions();
  toast('Bausteine geleert.');
}

function persistBausteine() {
  try { localStorage.setItem(BAUSTEINE_KEY, JSON.stringify(State.bausteine)); } catch (e) {}
}

/* ----------------------------------------------------------------------- */
/* Persistenz                                                               */
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

function serialize() {
  return {
    schemaVersion: SCHEMA_VERSION,
    typ: 'Kreditprotokoll',
    erstelltAm: new Date().toISOString(),
    cover: { ...State.cover },
    kopf: { ...State.header },
    antworten: buildAnswerExport(),
    manuelleAbschnitte: Object.keys(State.manualSections).length ? { ...State.manualSections } : undefined
  };
}
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
  download(`${name}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  toast('Datensatz gespeichert.');
}
function loadFromFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const report = applyImport(JSON.parse(reader.result), {});
      renderAll();
      toast(`Geladen: ${report.applied} Antwort(en) übernommen` +
        (report.skipped ? `, ${report.skipped} ignoriert` : '') + '.');
    } catch (err) { toast('Fehler: Datei ist kein gültiges JSON.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ----------------------------------------------------------------------- */
/* ROBUSTER IMPORT – nur passende Elemente                                  */
/* ----------------------------------------------------------------------- */
function applyImport(obj, { silent } = {}) {
  const report = { applied: 0, skipped: 0 };
  if (!obj || typeof obj !== 'object') return report;

  if (obj.cover && typeof obj.cover === 'object') {
    matchInto(obj.cover.kundeTyp, DATA.cover.kundeTyp, v => State.cover.kundeTyp = v);
    matchInto(obj.cover.kundenart, DATA.cover.kundenart, v => State.cover.kundenart = v);
    matchInto(obj.cover.finanzierung, DATA.cover.finanzierung, v => State.cover.finanzierung = v);
  }
  if (obj.kopf && typeof obj.kopf === 'object') {
    for (const k of Object.keys(State.header)) {
      if (typeof obj.kopf[k] === 'string') State.header[k] = obj.kopf[k];
    }
  }
  const ant = obj.antworten || obj.answers;
  if (ant && typeof ant === 'object') {
    for (const [nr, val] of Object.entries(ant)) {
      const q = Q_BY_NR.get(nr);
      if (!q || !val || typeof val !== 'object') { report.skipped++; continue; }
      const ans = matchAnswer(q, val.auswahl ?? val.label ?? val.antwort);
      if (!ans) { report.skipped++; continue; }
      const entry = { label: ans.label };
      const begr = val.begruendung ?? val.kommentar ?? val.comment;
      if (ans.comment && typeof begr === 'string' && begr.trim()) entry.begruendung = begr;
      State.answers[nr] = entry;
      report.applied++;
    }
  }
  // manuelle Abschnitte: nur bekannte Abschnitts-IDs, nur Strings
  const man = obj.manuelleAbschnitte;
  if (man && typeof man === 'object') {
    for (const [sid, txt] of Object.entries(man)) {
      if (SECTION_IDS.has(sid) && typeof txt === 'string') State.manualSections[sid] = txt;
    }
  }
  if (!silent && report.applied === 0 && report.skipped === 0) toast('Keine passenden Daten im Import gefunden.');
  return report;
}

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
/* Zurücksetzen & Hilfen                                                    */
/* ----------------------------------------------------------------------- */
function resetAll() {
  if (!confirm('Alle Eingaben verwerfen und neu beginnen?')) return;
  State.cover = { kundeTyp: '', kundenart: '', finanzierung: '' };
  State.header = { kreditnehmer: '', stammnummer: '', datum: '', berater: '', bearbeiter: '', obligo: '', bemerkung: '' };
  State.answers = {}; State.manualSections = {}; State.editMode = false; State.activeTab = null;
  localStorage.removeItem(STORAGE_KEY);
  renderAll(); toast('Zurückgesetzt.');
}

/* ----------------------------------------------------------------------- */
/* Einklappbare Karten                                                      */
/* ----------------------------------------------------------------------- */
function applyCollapse() {
  let c = {};
  try { c = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch (e) {}
  document.querySelectorAll('.card.collapsible').forEach(card => {
    const id = card.querySelector('[data-collapse]')?.dataset.collapse;
    if (id && id in c) card.classList.toggle('is-collapsed', !!c[id]);
  });
}
function saveCollapse() {
  const c = {};
  document.querySelectorAll('.card.collapsible').forEach(card => {
    const id = card.querySelector('[data-collapse]')?.dataset.collapse;
    if (id) c[id] = card.classList.contains('is-collapsed');
  });
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(c)); } catch (e) {}
}

/* ----------------------------------------------------------------------- */
/* KI-Export-Dialog                                                         */
/* ----------------------------------------------------------------------- */
function kiQuestions() {
  // Fragen der aktuellen Variante; ohne Auswahl: alle (außer Legacy ohne Varianten)
  const variant = currentVariant();
  const list = variant != null
    ? visibleQuestions(variant)
    : DATA.questions.filter(q => Array.isArray(q.variants) && q.variants.length);
  return list;
}

function openKiModal() {
  const variant = currentVariant();
  document.getElementById('kiScope').textContent = variant == null
    ? 'alle Fragen (keine Variante gewählt)'
    : `Variante ${variant}: ${State.cover.kundeTyp} / ${State.cover.kundenart} / ${State.cover.finanzierung}`;
  document.getElementById('kiFragen').value = buildKiFragen();
  document.getElementById('kiPrompt').value = buildKiPrompt();
  switchKiTab('fragen');
  document.getElementById('kiModal').hidden = false;
}
function closeKiModal() { document.getElementById('kiModal').hidden = true; }
function switchKiTab(name) {
  document.querySelectorAll('.ki-tab').forEach(t => t.classList.toggle('is-active', t.dataset.kitab === name));
  document.querySelectorAll('[data-kipanel]').forEach(p => { p.hidden = p.dataset.kipanel !== name; });
}

// Reiter A: Fragen + Auswahlmöglichkeiten in Kurzform
function buildKiFragen() {
  const qs = kiQuestions();
  const bySec = {};
  qs.forEach(q => (bySec[q.section] = bySec[q.section] || []).push(q));
  const out = [];
  for (const sec of DATA.sections) {
    const items = bySec[sec.id];
    if (!items || !items.length) continue;
    out.push(`### ${sec.title}`);
    for (const q of items) {
      const opts = q.answers.filter(a => !a.placeholder)
        .map(a => a.comment ? `${a.label} [Begründung nötig]` : a.label);
      out.push(`${q.nr}: ${oneLine(q.frage)}`);
      if (opts.length) out.push(`   Optionen: ${opts.join(' | ')}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// Reiter B: strikter Prompt zur Erzeugung der Datensatz-JSON
function buildKiPrompt() {
  const variant = currentVariant();
  const coverHint = variant == null ? '' :
    `\n- Setze im Feld "cover": {"kundeTyp":"${State.cover.kundeTyp}","kundenart":"${State.cover.kundenart}","finanzierung":"${State.cover.finanzierung}"}.`;
  const fragen = buildKiFragen();
  return [
'[HIER ZUERST DEINEN DIKTIERTEN FALLTEXT EINFÜGEN]',
'',
'====================  ANWEISUNG  ====================',
'',
'Du bist ein Assistent, der aus dem oben stehenden Falltext ein Kreditprotokoll als JSON-Datensatz erzeugt.',
'Analysiere ausschließlich den oben stehenden Falltext und ordne ihn den unten aufgeführten Fragen zu.',
'',
'STRIKTE REGELN:',
'1. Gib AUSSCHLIESSLICH gültiges JSON aus – keinen Fließtext, keine Erklärungen, keine Markdown-Codeblöcke.',
'2. Verwende GENAU die unten gelisteten Fragenummern als Schlüssel in "antworten".',
'3. Der Wert von "auswahl" muss WORTWÖRTLICH einer der zur Frage gelisteten Optionen entsprechen (exakt, inkl. Groß-/Kleinschreibung und Satzzeichen). Erfinde keine Optionen.',
'4. Nur Optionen, die mit [Begründung nötig] markiert sind, brauchen zusätzlich ein Feld "begruendung" (kurzer, sachlicher Text aus dem Falltext). Bei allen anderen KEIN "begruendung".',
'5. Beantworte nur Fragen, die aus dem Falltext eindeutig hervorgehen. Ist etwas nicht ableitbar, lasse die Frage WEG (nicht raten).',
'6. Keine zusätzlichen Felder, Kommentare oder Schlüssel außerhalb des vorgegebenen Schemas.' + coverHint,
'',
'AUSGABE-SCHEMA (genau diese Struktur):',
'{',
'  "schemaVersion": 1,',
'  "typ": "Kreditprotokoll",',
'  "cover": { "kundeTyp": "...", "kundenart": "...", "finanzierung": "..." },',
'  "kopf": { "kreditnehmer": "", "stammnummer": "", "datum": "", "berater": "", "bearbeiter": "", "obligo": "", "bemerkung": "" },',
'  "antworten": {',
'    "<Fragenummer>": { "auswahl": "<exakte Option>", "begruendung": "<nur falls nötig>" }',
'  }',
'}',
'',
'cover-Werte sind ausschließlich: kundeTyp = BestandsKunde | NeuKunde; kundenart = aHB | sHB; finanzierung = BauFi | Exi | SoFi | Kompakt.',
'',
'====================  FRAGEN & OPTIONEN  ====================',
'',
fragen,
'',
'====================  ENDE  ====================',
'Gib jetzt NUR das JSON gemäß Schema aus.'
  ].join('\n');
}

function oneLine(s) { return String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim(); }

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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cssEsc(s) { return String(s == null ? '' : s).replace(/["\\]/g, '\\$&'); }
