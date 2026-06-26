/**
 * App – UI-Verdrahtung für die Heustockmessung.
 * Reine Vanilla-JS-SPA; Persistenz läuft serverseitig über Api (api.php / SQLite).
 * Hierarchie: Messstelle → Halle → Ort. Erfassung als geführter Ablauf.
 */
const App = (() => {

  // --- Warnstufen (Ampel) -------------------------------------------------
  // Texte je Stufe; die Schwellenwerte (ab welcher Temperatur) sind in der App
  // konfigurierbar (Heu/Stroh) und werden serverseitig gespeichert.
  const STUFEN_TEXT = {
    rot:    { klasse: 'rot',    titel: 'Akute Brandgefahr',
      hinweis: 'Sofort Feuerwehr/Fachberater verständigen – nur unter Aufsicht und Brandschutz ausräumen.' },
    orange: { klasse: 'orange', titel: 'Kritisch',
      hinweis: 'Engmaschig (z. B. alle 2 Std.) kontrollieren, Feuerwehr informieren, Ausräumen vorbereiten.' },
    gelb:   { klasse: 'gelb',   titel: 'Erhöht',
      hinweis: 'Beginnende Selbsterhitzung – täglich kontrollieren und dokumentieren.' },
    gruen:  { klasse: 'gruen',  titel: 'Unbedenklich', hinweis: 'Normaler Bereich.' },
  };
  // Standard: Richtwerte für Heu. Per ⚙ Schwellenwerte anpassbar.
  let SCHWELLEN = { gelb: 45, orange: 60, rot: 70, material: 'Heu' };

  function baueStufen() {
    return [
      { ab: SCHWELLEN.rot,    ...STUFEN_TEXT.rot },
      { ab: SCHWELLEN.orange, ...STUFEN_TEXT.orange },
      { ab: SCHWELLEN.gelb,   ...STUFEN_TEXT.gelb },
      { ab: -Infinity,        ...STUFEN_TEXT.gruen },
    ];
  }
  let STUFEN = baueStufen();

  function stufeFuer(t) {
    if (t === null || t === undefined || isNaN(t)) return null;
    return STUFEN.find((s) => t >= s.ab);
  }

  // --- Zustand ------------------------------------------------------------
  const State = {
    messstellen: [],
    messreihen: [],
    online: false,
    rev: null,               // Revisionsstand für das Live-Update
    editReiheId: null,       // null = neue Reihe, sonst bestehende bearbeiten
    werte: {},               // ort_id -> { temperatur, notiz }
    wizardStelleId: null,    // aktuell gewählte Messstelle
    wizardSchritt: 0,        // 0 = Kopf, 1..H = Hallen, H+1 = Übersicht
    kopf: leererKopf(),      // Kopfdaten der Messung (über Schritte hinweg)
    filter: { stelleId: '', halleId: '', von: '', bis: '', nurKritisch: false },
    diagrammStelleId: null,  // im Diagramm gewählte Messstelle
    diagrammHalleId: '',     // optional eingegrenzte Halle ('' = alle)
  };

  // Plausibler Temperaturbereich – außerhalb davon Warnung (Tippfehler).
  const PLAUSIBEL = { min: -20, max: 150 };
  // Farbpalette für Mehrlinien-Diagramm (je Ort eine Farbe).
  const DIAG_FARBEN = ['#c1121f', '#1d4ed8', '#0f766e', '#b45309', '#7c3aed',
    '#be185d', '#4d7c0f', '#0369a1', '#9333ea', '#db2777', '#15803d', '#a16207'];

  function leererKopf() {
    return {
      zeitpunkt: '', messer: '', notiz: '', foto: '',
      aussentemperatur: '', temp_quelle: 'manuell',
      geo_lat: null, geo_lon: null, wetter_text: '',
    };
  }

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, ...kinder) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    for (const kind of kinder) {
      if (kind == null) continue;
      n.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
    }
    return n;
  }

  function meldung(text, art = 'info') {
    const box = $('#meldung');
    box.className = 'meldung ' + art;
    box.textContent = text;
    box.hidden = false;
    if (art !== 'fehler') {
      clearTimeout(meldung._t);
      meldung._t = setTimeout(() => { box.hidden = true; }, 4000);
    }
  }

  function lokaleZeit(date = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
         + `T${p(date.getHours())}:${p(date.getMinutes())}`;
  }

  function zeitLesbar(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  // --- Daten laden --------------------------------------------------------
  async function ladeDaten() {
    try {
      const d = await Api.alles();
      State.messstellen = d.messstellen || [];
      State.messreihen = d.messreihen || [];
      State.rev = d.rev ?? State.rev;
      if (d.schwellen && typeof d.schwellen.gelb === 'number') {
        SCHWELLEN = { gelb: d.schwellen.gelb, orange: d.schwellen.orange, rot: d.schwellen.rot,
          material: d.schwellen.material || 'Heu' };
        STUFEN = baueStufen();
      }
      State.online = true;
    } catch (e) {
      State.online = false;
      meldung('Keine Verbindung zum Server: ' + e.message
        + ' – läuft die Seite auf einem PHP-Server?', 'fehler');
    }
    setVerbindung(State.online);
  }

  function setVerbindung(ok) {
    const b = $('#verbindung');
    b.textContent = ok ? '● Server verbunden' : '● Offline';
    b.className = 'verbindung ' + (ok ? 'on' : 'off');
  }

  // Ort + zugehörige Halle + Messstelle anhand Ort-ID finden.
  function ortById(id) {
    for (const s of State.messstellen) {
      for (const h of (s.hallen || [])) {
        const o = (h.orte || []).find((x) => x.id === id);
        if (o) return { ort: o, halle: h, stelle: s };
      }
    }
    return null;
  }

  function stelleById(id) {
    return State.messstellen.find((s) => s.id === id) || null;
  }

  // ======================================================================
  //  Ansicht 1: Messung erfassen (geführter Ablauf)
  // ======================================================================
  function renderMessung() {
    const wrap = $('#view-messung');
    wrap.innerHTML = '';

    if (!State.messstellen.length) {
      wrap.append(el('div', { class: 'leer' },
        'Noch keine Messstellen angelegt. Wechseln Sie zum Reiter ',
        el('strong', {}, 'Messstellen'),
        ', um Messstellen, Hallen und Orte (z. B. Oben/Mitte/Unten) anzulegen.'));
      return;
    }

    const stelle = stelleById(State.wizardStelleId);

    if (State.wizardSchritt === 0 || !stelle) {
      renderKopfSchritt(wrap);
      return;
    }
    const hallen = stelle.hallen || [];
    if (State.wizardSchritt >= 1 && State.wizardSchritt <= hallen.length) {
      renderHalleSchritt(wrap, stelle, hallen, State.wizardSchritt);
      return;
    }
    renderUebersicht(wrap, stelle, hallen);
  }

  // Schritt 0: Messstelle wählen + Kopfdaten
  function renderKopfSchritt(wrap) {
    const aktiveId = State.wizardStelleId || State.messstellen[0].id;
    wrap.append(schrittKopf('Schritt 1 von 2', State.editReiheId ? 'Messung bearbeiten' : 'Neue Messung – Messstelle & Kopfdaten'));

    const form = el('form', { class: 'mess-kopf', onsubmit: (e) => e.preventDefault() });

    // Messstelle (Anfahrt)
    const sel = el('select', { id: 'm-stelle' });
    for (const s of State.messstellen) {
      sel.append(el('option', { value: s.id, ...(s.id === aktiveId ? { selected: '' } : {}) },
        s.name + ((s.hallen || []).length ? ` (${s.hallen.length} Hallen)` : ' (keine Hallen)')));
    }

    const fZeit = el('input', { type: 'datetime-local', id: 'm-zeit',
      value: State.kopf.zeitpunkt || lokaleZeit() });

    const bekannte = erfasserNamen();
    const fMesser = el('input', {
      type: 'text', id: 'm-messer', placeholder: 'Name auswählen oder eingeben',
      autocomplete: 'off', list: 'erfasser-liste',
      value: State.kopf.messer || (State.editReiheId ? '' : letzterErfasser()),
    });
    const dl = el('datalist', { id: 'erfasser-liste' }, ...bekannte.map((n) => el('option', { value: n })));

    const fTemp = el('input', { type: 'number', id: 'm-temp', step: '0.1', inputmode: 'decimal',
      placeholder: '°C', class: 'temp-feld', value: State.kopf.aussentemperatur ?? '' });
    const autoVorh = State.kopf.temp_quelle === 'open-meteo';
    const fQuelle = el('span', { id: 'm-quelle', class: 'quelle' }, autoVorh ? 'auto · ' + State.kopf.wetter_text : 'manuell');
    if (autoVorh) { fQuelle.dataset.quelle = 'open-meteo'; fQuelle.dataset.lat = State.kopf.geo_lat; fQuelle.dataset.lon = State.kopf.geo_lon; }
    const wetterBtn = el('button', { type: 'button', class: 'btn klein', onclick: holeWetter }, '⤓ Standort/Wetter');
    fTemp.addEventListener('input', () => { fQuelle.textContent = 'manuell'; fQuelle.dataset.quelle = ''; fQuelle.dataset.lat = ''; fQuelle.dataset.lon = ''; });

    const fNotiz = el('input', { type: 'text', id: 'm-notiz', placeholder: 'Notiz zur Messung (optional)', value: State.kopf.notiz || '' });

    // Foto/Beleg
    const fFoto = el('input', { type: 'file', accept: 'image/*', capture: 'environment', onchange: fotoGewaehlt });
    const fotoBox = el('div', { class: 'foto-box' }, fFoto);
    if (State.kopf.foto) {
      fotoBox.append(
        el('img', { class: 'foto-vorschau', src: State.kopf.foto, alt: 'Beleg' }),
        el('button', { type: 'button', class: 'btn mini gefahr', onclick: () => { leseKopf(); State.kopf.foto = ''; renderMessung(); } }, 'Foto entfernen'),
      );
    }

    form.append(
      feld('Messstelle (Anfahrt)', sel),
      feld('Zeitpunkt', fZeit),
      feld('Erfasser/in', fMesser, dl),
      feld('Außentemperatur', el('span', { class: 'temp-zeile' }, fTemp, el('span', {}, '°C'), wetterBtn, fQuelle)),
      feld('Notiz', fNotiz),
      feld('Foto/Beleg', fotoBox),
    );
    wrap.append(form);

    const stelle = stelleById(aktiveId);
    if (stelle && !(stelle.hallen || []).length) {
      wrap.append(el('div', { class: 'leer hinweis' },
        'Diese Messstelle hat noch keine Hallen. Bitte im Reiter ', el('strong', {}, 'Messstellen'), ' anlegen.'));
    }

    const leiste = el('div', { class: 'aktionsleiste' });
    leiste.append(
      el('button', { class: 'btn primaer', onclick: () => {
        State.wizardStelleId = Number($('#m-stelle').value);
        leseKopf();
        State.wizardSchritt = 1;
        renderMessung();
      } }, 'Weiter →'),
      el('button', { class: 'btn', onclick: neueMessung }, '✕ Abbrechen'),
    );
    wrap.append(leiste);
  }

  // Schritte 1..H: eine Halle, ihre Orte erfassen
  function renderHalleSchritt(wrap, stelle, hallen, n) {
    const halle = hallen[n - 1];
    wrap.append(schrittKopf(
      `${stelle.name} · Halle ${n} von ${hallen.length}`,
      halle.name + (halle.beschreibung ? ' – ' + halle.beschreibung : '')));
    wrap.append(fortschritt(n, hallen.length + 1));
    wrap.append(legende());

    const karte = el('section', { class: 'stelle-karte' });
    if (!(halle.orte || []).length) {
      karte.append(el('p', { class: 'klein-grau' }, 'Keine Orte in dieser Halle – im Reiter „Messstellen" ergänzen.'));
    }
    for (const ort of (halle.orte || [])) {
      karte.append(ortZeile(ort));
    }
    wrap.append(karte);

    const leiste = el('div', { class: 'aktionsleiste' });
    leiste.append(
      el('button', { class: 'btn', onclick: () => { State.wizardSchritt = n - 1; renderMessung(); } }, '← Zurück'),
      el('button', { class: 'btn primaer', onclick: () => { State.wizardSchritt = n + 1; renderMessung(); } },
        n < hallen.length ? 'Weiter →' : 'Zur Übersicht →'),
    );
    wrap.append(leiste);
  }

  // Letzter Schritt: Übersicht + Speichern
  function renderUebersicht(wrap, stelle, hallen) {
    wrap.append(schrittKopf('Übersicht & Speichern', stelle.name));
    wrap.append(fortschritt(hallen.length + 1, hallen.length + 1));

    const k = State.kopf;
    wrap.append(el('div', { class: 'uebersicht-kopf' },
      el('span', {}, '🕓 ' + zeitLesbar(k.zeitpunkt || lokaleZeit())),
      k.messer ? el('span', {}, '👤 ' + k.messer) : null,
      (k.aussentemperatur !== '' && k.aussentemperatur != null)
        ? el('span', {}, '🌡 außen ' + k.aussentemperatur + ' °C' + (k.temp_quelle === 'open-meteo' ? ' (auto)' : '')) : null,
      k.notiz ? el('span', {}, '📝 ' + k.notiz) : null,
    ));
    if (k.foto) wrap.append(el('img', { class: 'foto-vorschau gross', src: k.foto, alt: 'Beleg' }));

    let anzahl = 0;
    for (const halle of hallen) {
      const orte = (halle.orte || []).filter((o) => {
        const v = State.werte[o.id];
        return v && v.temperatur != null && !isNaN(v.temperatur);
      });
      if (!orte.length) continue;
      const tab = el('table', { class: 'werte-tab' });
      tab.append(el('tr', {}, el('th', { colspan: '3' }, '🏚 ' + halle.name)));
      for (const ort of orte) {
        const t = State.werte[ort.id].temperatur;
        const st = stufeFuer(t);
        anzahl++;
        tab.append(el('tr', { class: st ? 's-' + st.klasse : '' },
          el('td', {}, ort.bezeichnung),
          el('td', { class: 'num' }, t.toFixed(1) + ' °C'),
          el('td', {}, st ? st.titel : '')));
      }
      wrap.append(el('div', { class: 'tab-scroll' }, tab));
    }
    if (!anzahl) {
      wrap.append(el('div', { class: 'leer hinweis' }, 'Noch keine Temperaturwerte erfasst.'));
    }

    // Vollständigkeitskontrolle
    const fehl = fehlendeOrte(stelle);
    if (fehl.length) {
      wrap.append(el('div', { class: 'leer hinweis' },
        el('strong', {}, '⚠ Noch nicht gemessen (' + fehl.length + '): '),
        fehl.join(', ')));
    } else if (anzahl) {
      wrap.append(el('div', { class: 'vollstaendig' }, '✓ Alle Orte dieser Messstelle erfasst.'));
    }

    const leiste = el('div', { class: 'aktionsleiste' });
    leiste.append(
      el('button', { class: 'btn', onclick: () => { State.wizardSchritt = hallen.length; renderMessung(); } }, '← Zurück'),
      el('button', { class: 'btn primaer', onclick: speichereMessreihe },
        State.editReiheId ? '✓ Änderungen speichern' : '✓ Messung speichern'),
    );
    wrap.append(leiste);
  }

  // --- Bausteine ----------------------------------------------------------
  function schrittKopf(klein, gross) {
    return el('div', { class: 'schritt-kopf' },
      el('div', { class: 'schritt-klein' }, klein),
      el('h2', { class: 'schritt-gross' }, gross));
  }

  function fortschritt(akt, gesamt) {
    const pct = Math.max(0, Math.min(100, Math.round((akt / gesamt) * 100)));
    return el('div', { class: 'fortschritt', title: `Schritt ${akt} von ${gesamt}` },
      el('div', { class: 'fortschritt-bar', style: 'width:' + pct + '%' }));
  }

  function feld(label, ...inhalt) {
    return el('label', { class: 'feld' }, el('span', { class: 'feld-label' }, label), ...inhalt);
  }

  function ortZeile(ort) {
    const vorhanden = State.werte[ort.id] || {};
    const setze = (feld, wert) => { State.werte[ort.id] = { ...(State.werte[ort.id] || {}), [feld]: wert }; };

    const input = el('input', {
      type: 'number', step: '0.1', inputmode: 'decimal', class: 'temp-feld', placeholder: '–',
      'data-ort': ort.id, value: vorhanden.temperatur ?? '',
    });
    const badge = el('span', { class: 'badge' });
    const upd = () => {
      const t = input.value === '' ? null : parseFloat(input.value);
      setze('temperatur', input.value === '' ? null : t);
      const st = stufeFuer(t);
      const unplausibel = t !== null && (t < PLAUSIBEL.min || t > PLAUSIBEL.max);
      input.className = 'temp-feld' + (st ? ' s-' + st.klasse : '') + (unplausibel ? ' unplausibel' : '');
      input.title = unplausibel ? 'Unplausibler Wert – Tippfehler?' : '';
      badge.className = 'badge' + (unplausibel ? ' warn' : (st ? ' s-' + st.klasse : ''));
      badge.textContent = unplausibel ? '⚠ prüfen' : (st && t !== null ? st.titel : '');
      badge.title = unplausibel ? 'Temperatur außerhalb ' + PLAUSIBEL.min + '…' + PLAUSIBEL.max + ' °C' : (st ? st.hinweis : '');
    };
    input.addEventListener('input', upd);

    const tiefe = el('input', { type: 'text', class: 'tiefe-feld', placeholder: 'Tiefe/Pos.',
      value: vorhanden.tiefe || '', title: 'Sondentiefe oder -position, z. B. „150 cm"' });
    tiefe.addEventListener('input', () => setze('tiefe', tiefe.value));
    const notiz = el('input', { type: 'text', class: 'ort-notiz-feld', placeholder: 'Notiz (z. B. Sonde klemmt)',
      value: vorhanden.notiz || '' });
    notiz.addEventListener('input', () => setze('notiz', notiz.value));

    const z = el('div', { class: 'ebene-zeile' },
      el('div', { class: 'ebene-haupt' },
        el('label', { class: 'ebene-name' }, ort.bezeichnung), input, el('span', {}, '°C'), badge),
      el('div', { class: 'ebene-zusatz' }, tiefe, notiz));
    upd();
    return z;
  }

  // Kopfdaten aus den DOM-Feldern (nur auf Schritt 0 vorhanden) sichern.
  function leseKopf() {
    const z = $('#m-zeit');
    if (!z) return;
    State.kopf.zeitpunkt = z.value;
    State.kopf.messer = $('#m-messer').value.trim();
    State.kopf.notiz = $('#m-notiz').value.trim();
    State.kopf.aussentemperatur = $('#m-temp').value;
    const q = $('#m-quelle');
    if (q.dataset.quelle === 'open-meteo') {
      State.kopf.temp_quelle = 'open-meteo';
      State.kopf.geo_lat = q.dataset.lat;
      State.kopf.geo_lon = q.dataset.lon;
      State.kopf.wetter_text = q.textContent.replace(/^auto · /, '');
    } else {
      State.kopf.temp_quelle = 'manuell';
      State.kopf.geo_lat = null; State.kopf.geo_lon = null; State.kopf.wetter_text = '';
    }
  }

  function erfasserNamen() {
    const set = new Set();
    for (const r of State.messreihen) {
      const n = (r.messer || '').trim();
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }
  function letzterErfasser() {
    try { return localStorage.getItem('heustock_erfasser') || ''; } catch (e) { return ''; }
  }
  function merkeErfasser(name) {
    try { if (name) localStorage.setItem('heustock_erfasser', name); } catch (e) { /* egal */ }
  }

  function legende() {
    const l = el('div', { class: 'legende' });
    for (const s of [...STUFEN].reverse()) {
      const von = s.ab === -Infinity ? '< ' + SCHWELLEN.gelb : '≥ ' + s.ab;
      l.append(el('span', { class: 'leg-eintrag s-' + s.klasse, title: s.hinweis },
        el('span', { class: 'leg-punkt' }), `${von} °C – ${s.titel}`));
    }
    return l;
  }

  async function holeWetter() {
    const q0 = $('#m-quelle');
    if (q0) q0.textContent = '… Standort wird ermittelt';
    try {
      const w = await Wetter.aktuelleTemperatur();
      // Zuerst in den Zustand schreiben – so geht der Wert auch bei einem
      // zwischenzeitlichen Re-Render nicht verloren.
      State.kopf.aussentemperatur = w.temperatur.toFixed(1);
      State.kopf.temp_quelle = 'open-meteo';
      State.kopf.geo_lat = w.lat; State.kopf.geo_lon = w.lon; State.kopf.wetter_text = w.text;
      // Falls die Felder noch da sind, direkt aktualisieren.
      const tempEl = $('#m-temp'), qEl = $('#m-quelle');
      if (tempEl) tempEl.value = w.temperatur.toFixed(1);
      if (qEl) { qEl.textContent = 'auto · ' + w.text; qEl.dataset.lat = w.lat; qEl.dataset.lon = w.lon; qEl.dataset.quelle = w.quelle; }
      meldung('Außentemperatur automatisch übernommen: ' + w.temperatur.toFixed(1) + ' °C', 'ok');
    } catch (e) {
      const qEl = $('#m-quelle');
      if (qEl) qEl.textContent = 'manuell';
      meldung('Automatik fehlgeschlagen: ' + e.message + ' – bitte manuell eingeben.', 'fehler');
    }
  }

  // Foto vor dem Hochladen verkleinern (spart Platz in DB/Backup).
  function bildKomprimieren(file, maxPx = 1024, qualitaet = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; }
        else if (h > maxPx) { w = Math.round(w * maxPx / h); h = maxPx; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', qualitaet));
      };
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function fotoGewaehlt(e) {
    const f = e.target.files[0];
    if (!f) return;
    leseKopf();
    try {
      State.kopf.foto = await bildKomprimieren(f);
      meldung('Foto übernommen.', 'ok');
    } catch (err) {
      meldung('Foto: ' + err.message, 'fehler');
    }
    renderMessung();
  }

  function neueMessung() {
    State.editReiheId = null;
    State.werte = {};
    State.wizardStelleId = null;
    State.wizardSchritt = 0;
    State.kopf = leererKopf();
    renderMessung();
  }

  async function speichereMessreihe() {
    const k = State.kopf;
    const werte = Object.entries(State.werte)
      .map(([ort_id, v]) => ({
        ort_id: Number(ort_id),
        temperatur: (v.temperatur === undefined || v.temperatur === '' || isNaN(v.temperatur)) ? null : v.temperatur,
        tiefe: (v.tiefe || '').trim(),
        notiz: (v.notiz || '').trim(),
      }))
      .filter((w) => w.temperatur !== null || w.tiefe || w.notiz);

    if (!werte.length) {
      meldung('Bitte mindestens einen Wert (Temperatur oder Notiz) eingeben.', 'fehler');
      return;
    }
    // Plausibilität: bei unrealistischen Temperaturen nachfragen
    const unplausibel = werte.filter((w) => w.temperatur != null && (w.temperatur < PLAUSIBEL.min || w.temperatur > PLAUSIBEL.max));
    if (unplausibel.length && !confirm('Unplausible Temperatur(en): '
      + unplausibel.map((w) => w.temperatur + ' °C').join(', ')
      + '\n(außerhalb ' + PLAUSIBEL.min + '…' + PLAUSIBEL.max + ' °C – Tippfehler?)\n\nTrotzdem speichern?')) {
      return;
    }

    // Vollständigkeit: bei fehlenden Orten nachfragen
    const stelle = stelleById(State.wizardStelleId);
    if (stelle) {
      const fehl = fehlendeOrte(stelle);
      if (fehl.length && !confirm('Es fehlen noch ' + fehl.length + ' Orte:\n' + fehl.join(', ')
        + '\n\nMessung trotzdem speichern?')) {
        return;
      }
    }
    const auto = k.temp_quelle === 'open-meteo';
    const daten = {
      id: State.editReiheId || undefined,
      messstelle_id: State.wizardStelleId || null,
      zeitpunkt: k.zeitpunkt ? new Date(k.zeitpunkt).toISOString() : new Date().toISOString(),
      aussentemperatur: (k.aussentemperatur === '' || k.aussentemperatur == null) ? null : parseFloat(k.aussentemperatur),
      temp_quelle: auto ? 'open-meteo' : 'manuell',
      geo_lat: auto ? parseFloat(k.geo_lat) : null,
      geo_lon: auto ? parseFloat(k.geo_lon) : null,
      wetter_text: auto ? k.wetter_text : '',
      messer: k.messer || '',
      notiz: k.notiz || '',
      foto: k.foto || '',
      messwerte: werte,
    };

    try {
      await Api.messreiheSave(daten);
      merkeErfasser(daten.messer);
      meldung('Messung gespeichert (' + werte.length + ' Werte).', 'ok');
      neueMessung();
      await ladeDaten();
      renderAlles();
      zeigeView('verlauf');
    } catch (e) {
      // Kein Server erreichbar → offline puffern und später synchronisieren
      if (!navigator.onLine || /erreichbar/i.test(e.message)) {
        Offline.add(daten);
        merkeErfasser(daten.messer);
        aktualisiereOfflineStatus();
        meldung('Kein Server erreichbar – Messung offline gespeichert ('
          + Offline.count() + ' warten auf Übertragung).', 'info');
        neueMessung();
      } else {
        meldung('Speichern fehlgeschlagen: ' + e.message, 'fehler');
      }
    }
  }

  function fehlendeOrte(stelle) {
    const fehl = [];
    for (const h of (stelle.hallen || [])) {
      for (const o of (h.orte || [])) {
        const v = State.werte[o.id];
        if (!(v && v.temperatur != null && !isNaN(v.temperatur))) fehl.push(h.name + '·' + o.bezeichnung);
      }
    }
    return fehl;
  }

  // ======================================================================
  //  Ansicht 2: Messstellen (Stammdaten) – Messstelle → Halle → Ort
  // ======================================================================
  function renderMessstellen() {
    const wrap = $('#view-messstellen');
    wrap.innerHTML = '';

    const neu = el('div', { class: 'stelle-neu' });
    const inName = el('input', { type: 'text', placeholder: 'Neue Messstelle (z. B. Hof Müller)' });
    const inBesch = el('input', { type: 'text', placeholder: 'Beschreibung/Adresse (optional)' });
    neu.append(inName, inBesch, el('button', {
      class: 'btn primaer',
      onclick: () => {
        if (!inName.value.trim()) { meldung('Name fehlt.', 'fehler'); return; }
        aktion(() => Api.messstelleSave({ name: inName.value.trim(), beschreibung: inBesch.value.trim() }));
      },
    }, '+ Messstelle'));
    wrap.append(el('h2', {}, 'Messstellen · Hallen · Orte'), neu);

    if (!State.messstellen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Noch keine Messstellen.'));
      return;
    }

    for (const stelle of State.messstellen) {
      wrap.append(messstelleKarte(stelle));
    }
  }

  function messstelleKarte(stelle) {
    const karte = el('section', { class: 'stelle-karte' });
    const titel = el('input', { type: 'text', class: 'inline-edit', value: stelle.name });
    const besch = el('input', { type: 'text', class: 'inline-edit klein', value: stelle.beschreibung || '', placeholder: 'Beschreibung/Adresse' });
    karte.append(el('div', { class: 'stelle-kopf' },
      el('span', { class: 'ebene-tag' }, 'Messstelle'),
      titel, besch,
      el('button', { class: 'btn klein', onclick: () =>
        aktion(() => Api.messstelleSave({ id: stelle.id, name: titel.value.trim(), beschreibung: besch.value.trim() })) }, 'Speichern'),
      el('button', { class: 'btn klein', title: 'Struktur (Hallen/Orte) als neue Messstelle kopieren', onclick: () =>
        aktion(() => Api.messstelleDuplizieren(stelle.id)) }, 'Duplizieren'),
      el('button', { class: 'btn klein gefahr', onclick: () => {
        if (confirm('Messstelle „' + stelle.name + '" inkl. aller Hallen, Orte und Messwerte löschen?'))
          aktion(() => Api.messstelleDelete(stelle.id));
      } }, 'Löschen'),
    ));

    // Hallen
    const hallenBox = el('div', { class: 'hallen-box' });
    const hallen = stelle.hallen || [];
    hallen.forEach((halle, hi) => hallenBox.append(halleBlock(stelle, halle, hi, hallen)));
    // Neue Halle
    const inHalle = el('input', { type: 'text', placeholder: 'Neue Halle (z. B. Halle 1)' });
    hallenBox.append(el('div', { class: 'halle-neu' },
      inHalle,
      el('button', { class: 'btn klein', onclick: () => {
        if (inHalle.value.trim()) aktion(() => Api.halleSave({ messstelle_id: stelle.id, name: inHalle.value.trim() }));
      } }, '+ Halle'),
    ));
    karte.append(hallenBox);
    return karte;
  }

  function halleBlock(stelle, halle, hi, hallen) {
    const block = el('div', { class: 'halle-block' });
    const hName = el('input', { type: 'text', class: 'inline-edit', value: halle.name });
    const halleSaver = (h, k) => Api.halleSave({ id: h.id, messstelle_id: stelle.id, name: h.name, beschreibung: h.beschreibung || '', sortierung: k });
    block.append(el('div', { class: 'halle-kopf' },
      el('span', { class: 'ebene-tag halle' }, 'Halle'),
      hName,
      sortKnoepfe(hallen, hi, halleSaver),
      el('button', { class: 'btn mini', onclick: () =>
        aktion(() => Api.halleSave({ id: halle.id, messstelle_id: stelle.id, name: hName.value.trim() })) }, '✓'),
      el('button', { class: 'btn mini gefahr', onclick: () => {
        if (confirm('Halle „' + halle.name + '" inkl. Orte und Messwerte löschen?'))
          aktion(() => Api.halleDelete(halle.id));
      } }, '✕'),
    ));

    const orte = el('div', { class: 'orte-liste' });
    const orteListe = halle.orte || [];
    const ortSaver = (o, k) => Api.ortSave({ id: o.id, halle_id: halle.id, bezeichnung: o.bezeichnung, sortierung: k });
    orteListe.forEach((ort, oi) => {
      const inO = el('input', { type: 'text', class: 'inline-edit', value: ort.bezeichnung });
      orte.append(el('div', { class: 'ort-edit' },
        inO,
        sortKnoepfe(orteListe, oi, ortSaver),
        el('button', { class: 'btn mini', onclick: () =>
          aktion(() => Api.ortSave({ id: ort.id, halle_id: halle.id, bezeichnung: inO.value.trim() })) }, '✓'),
        el('button', { class: 'btn mini gefahr', onclick: () => {
          if (confirm('Ort „' + ort.bezeichnung + '" löschen?')) aktion(() => Api.ortDelete(ort.id));
        } }, '✕'),
      ));
    });
    // Neuer Ort + Schnellbuttons
    const inOrt = el('input', { type: 'text', placeholder: 'Neuer Ort/Bezeichnung' });
    const addOrt = (bez) => aktion(() => Api.ortSave({ halle_id: halle.id, bezeichnung: bez }));
    const schnell = el('span', { class: 'schnell' });
    for (const v of ['Oben', 'Mitte', 'Unten']) {
      schnell.append(el('button', { class: 'btn mini', onclick: () => addOrt(v) }, '+ ' + v));
    }
    orte.append(el('div', { class: 'ort-neu' },
      inOrt,
      el('button', { class: 'btn mini', onclick: () => { if (inOrt.value.trim()) addOrt(inOrt.value.trim()); } }, '+ Ort'),
      schnell,
    ));
    block.append(orte);
    return block;
  }

  async function aktion(fn) {
    try {
      await fn();
      await ladeDaten();
      renderAlles();
    } catch (e) {
      meldung('Fehler: ' + e.message, 'fehler');
    }
  }

  // ▲/▼-Knöpfe zum Umsortieren eines Listeneintrags.
  function sortKnoepfe(items, index, saver) {
    return el('span', { class: 'sort-knoepfe' },
      el('button', { class: 'btn mini', title: 'nach oben', ...(index === 0 ? { disabled: '' } : {}),
        onclick: () => verschiebe(items, index, -1, saver) }, '▲'),
      el('button', { class: 'btn mini', title: 'nach unten', ...(index === items.length - 1 ? { disabled: '' } : {}),
        onclick: () => verschiebe(items, index, 1, saver) }, '▼'),
    );
  }

  // Element in einer Liste um eine Position verschieben und neue Reihenfolge
  // (sortierung 0..n) speichern.
  async function verschiebe(items, index, richtung, saver) {
    const j = index + richtung;
    if (j < 0 || j >= items.length) return;
    const neu = items.slice();
    [neu[index], neu[j]] = [neu[j], neu[index]];
    try {
      for (let k = 0; k < neu.length; k++) {
        if ((neu[k].sortierung ?? 0) !== k) await saver(neu[k], k);
      }
      await ladeDaten();
      renderAlles();
    } catch (e) {
      meldung('Sortieren fehlgeschlagen: ' + e.message, 'fehler');
    }
  }

  // ======================================================================
  //  Ansicht 3: Verlauf / Auswertung
  // ======================================================================
  function renderVerlauf() {
    const wrap = $('#view-verlauf');
    wrap.innerHTML = '';
    wrap.append(verlaufToolbar());

    if (!State.messreihen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Noch keine Messungen erfasst.'));
      return;
    }

    const reihen = gefilterteReihen();
    if (!reihen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Keine Messungen für den gewählten Filter.'));
      return;
    }
    const timelines = ortTimelines();

    for (const r of reihen) {
      const det = el('details', { class: 'reihe', open: State.messreihen.length <= 3 ? '' : null });
      const max = r.messwerte.reduce((m, w) => (w.temperatur != null && w.temperatur > m ? w.temperatur : m), -Infinity);
      const stMax = stufeFuer(max === -Infinity ? null : max);
      const stelle = r.messstelle_id ? stelleById(r.messstelle_id) : null;
      const stelleName = stelle ? stelle.name
        : (r.messwerte[0] ? (ortById(r.messwerte[0].ort_id)?.stelle.name || '—') : '—');

      det.append(el('summary', {},
        el('span', { class: 'r-stelle' }, '📍 ' + stelleName),
        el('span', { class: 'r-zeit' }, zeitLesbar(r.zeitpunkt)),
        stMax ? el('span', { class: 'badge s-' + stMax.klasse }, 'max ' + max.toFixed(1) + ' °C · ' + stMax.titel) : null,
        el('span', { class: 'klein-grau' },
          (r.aussentemperatur != null ? ' · außen ' + r.aussentemperatur + ' °C' : '')
          + (r.temp_quelle === 'open-meteo' ? ' (auto)' : '')
          + (r.messer ? ' · ' + r.messer : '')),
      ));

      // Werte nach Halle gruppieren
      const gruppen = new Map();
      for (const w of r.messwerte) {
        const info = ortById(w.ort_id);
        const halleName = info ? info.halle.name : 'Unbekannte Halle';
        if (!gruppen.has(halleName)) gruppen.set(halleName, []);
        gruppen.get(halleName).push({ w, info });
      }

      const tab = el('table', { class: 'werte-tab' });
      tab.append(el('tr', {},
        el('th', {}, 'Halle'), el('th', {}, 'Ort'),
        el('th', {}, 'Temperatur'), el('th', {}, 'Trend'), el('th', {}, 'Bewertung'), el('th', {}, 'Notiz')));
      for (const [halleName, eintraege] of gruppen) {
        eintraege.forEach(({ w, info }, i) => {
          const st = stufeFuer(w.temperatur);
          tab.append(el('tr', { class: st ? 's-' + st.klasse : '' },
            el('td', { class: 'halle-zelle' }, i === 0 ? halleName : ''),
            el('td', {}, info ? info.ort.bezeichnung : ('Ort #' + w.ort_id),
              w.tiefe ? el('span', { class: 'klein-grau' }, ' · ' + w.tiefe) : null),
            el('td', { class: 'num' }, w.temperatur != null ? w.temperatur.toFixed(1) + ' °C' : '—'),
            trendZelle(timelines, w.ort_id, r.zeitpunkt, w.temperatur),
            el('td', {}, st ? st.titel : ''),
            el('td', {}, w.notiz || '')));
        });
      }
      det.append(el('div', { class: 'tab-scroll' }, tab));

      if (r.foto) {
        det.append(el('a', { href: r.foto, target: '_blank', class: 'foto-link' },
          el('img', { class: 'foto-vorschau', src: r.foto, alt: 'Beleg zur Messung' })));
      }

      const fuss = el('div', { class: 'reihe-fuss' });
      if (r.notiz) fuss.append(el('span', { class: 'klein-grau' }, 'Notiz: ' + r.notiz + ' '));
      if (r.geo_lat != null) fuss.append(el('span', { class: 'klein-grau' },
        ' Standort: ' + r.geo_lat.toFixed(3) + ', ' + r.geo_lon.toFixed(3) + ' '));
      fuss.append(
        el('button', { class: 'btn mini', onclick: () => bearbeiteReihe(r) }, 'Bearbeiten'),
        el('button', { class: 'btn mini gefahr', onclick: () => {
          if (confirm('Diese Messung vom ' + zeitLesbar(r.zeitpunkt) + ' löschen?'))
            aktion(() => Api.messreiheDelete(r.id));
        } }, 'Löschen'),
      );
      det.append(fuss);
      wrap.append(det);
    }
  }

  function bearbeiteReihe(r) {
    State.editReiheId = r.id;
    State.werte = {};
    for (const w of r.messwerte) {
      State.werte[w.ort_id] = { temperatur: w.temperatur, tiefe: w.tiefe || '', notiz: w.notiz || '' };
    }
    // Messstelle bestimmen (aus Feld oder aus erstem Ort herleiten)
    let stelleId = r.messstelle_id;
    if (!stelleId && r.messwerte[0]) {
      const info = ortById(r.messwerte[0].ort_id);
      stelleId = info ? info.stelle.id : null;
    }
    State.wizardStelleId = stelleId;
    State.wizardSchritt = 0;
    State.kopf = {
      zeitpunkt: lokaleZeit(new Date(r.zeitpunkt)),
      messer: r.messer || '',
      notiz: r.notiz || '',
      foto: r.foto || '',
      aussentemperatur: r.aussentemperatur != null ? String(r.aussentemperatur) : '',
      temp_quelle: r.temp_quelle || 'manuell',
      geo_lat: r.geo_lat, geo_lon: r.geo_lon, wetter_text: r.wetter_text || '',
    };
    zeigeView('messung');
    renderMessung();
    meldung('Messung wird bearbeitet.', 'info');
  }

  // ======================================================================
  //  Verlauf-Werkzeuge: Filter, Trend, Excel, Backup
  // ======================================================================
  function stelleNameVon(id) { const s = stelleById(id); return s ? s.name : '—'; }

  function verlaufToolbar() {
    const kopf = el('div', { class: 'verlauf-kopf' },
      el('h2', {}, 'Verlauf & Auswertung'),
      el('div', { class: 'werkzeuge' },
        el('button', { class: 'btn klein', onclick: () => window.print() }, '🖨 Drucken'),
        berichtSteuerung(),
        jahrExportSteuerung(),
        el('button', { class: 'btn klein', onclick: backupHerunterladen }, '⭳ Backup'),
        wiederherstellenSteuerung(),
      ),
    );

    const filter = el('div', { class: 'filterleiste' });
    const selStelle = el('select', { onchange: (e) => { State.filter.stelleId = e.target.value; State.filter.halleId = ''; renderVerlauf(); } });
    selStelle.append(el('option', { value: '' }, 'Alle Messstellen'));
    for (const s of State.messstellen)
      selStelle.append(el('option', { value: String(s.id), ...(String(s.id) === State.filter.stelleId ? { selected: '' } : {}) }, s.name));

    const selHalle = el('select', { onchange: (e) => { State.filter.halleId = e.target.value; renderVerlauf(); } });
    selHalle.append(el('option', { value: '' }, 'Alle Hallen'));
    const aktStelle = State.filter.stelleId ? stelleById(Number(State.filter.stelleId)) : null;
    const hallen = aktStelle ? (aktStelle.hallen || []) : State.messstellen.flatMap((s) => s.hallen || []);
    for (const h of hallen)
      selHalle.append(el('option', { value: String(h.id), ...(String(h.id) === State.filter.halleId ? { selected: '' } : {}) }, h.name));

    const von = el('input', { type: 'date', value: State.filter.von, onchange: (e) => { State.filter.von = e.target.value; renderVerlauf(); } });
    const bis = el('input', { type: 'date', value: State.filter.bis, onchange: (e) => { State.filter.bis = e.target.value; renderVerlauf(); } });
    const krit = el('label', { class: 'check' },
      el('input', { type: 'checkbox', ...(State.filter.nurKritisch ? { checked: '' } : {}),
        onchange: (e) => { State.filter.nurKritisch = e.target.checked; renderVerlauf(); } }),
      ' nur kritische (≥ 60 °C)');
    const reset = el('button', { class: 'btn mini', onclick: () => {
      State.filter = { stelleId: '', halleId: '', von: '', bis: '', nurKritisch: false }; renderVerlauf();
    } }, 'Filter zurücksetzen');

    filter.append(feld('Messstelle', selStelle), feld('Halle', selHalle),
      feld('von', von), feld('bis', bis), krit, reset);
    return el('div', {}, kopf, filter);
  }

  function gefilterteReihen() {
    const f = State.filter;
    return State.messreihen.filter((r) => {
      const sid = r.messstelle_id || (r.messwerte[0] ? (ortById(r.messwerte[0].ort_id)?.stelle.id) : null);
      if (f.stelleId && String(sid) !== f.stelleId) return false;
      if (f.halleId && !r.messwerte.some((w) => { const i = ortById(w.ort_id); return i && String(i.halle.id) === f.halleId; })) return false;
      const t = new Date(r.zeitpunkt).getTime();
      if (f.von && t < new Date(f.von + 'T00:00').getTime()) return false;
      if (f.bis && t > new Date(f.bis + 'T23:59').getTime()) return false;
      if (f.nurKritisch) {
        const max = r.messwerte.reduce((m, w) => (w.temperatur != null && w.temperatur > m ? w.temperatur : m), -Infinity);
        if (!(max >= 60)) return false;
      }
      return true;
    });
  }

  // Zeitreihe je Ort (aufsteigend) für Trend und Diagramm.
  function ortTimelines() {
    const map = new Map();
    for (const r of State.messreihen) {
      const t = new Date(r.zeitpunkt).getTime();
      for (const w of r.messwerte) {
        if (w.temperatur == null) continue;
        if (!map.has(w.ort_id)) map.set(w.ort_id, []);
        map.get(w.ort_id).push({ t, temp: w.temperatur });
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.t - b.t);
    return map;
  }

  function trendZelle(map, ortId, zeitpunkt, temp) {
    if (temp == null) return el('td', {});
    const arr = map.get(ortId);
    if (!arr) return el('td', {});
    const tt = new Date(zeitpunkt).getTime();
    let prev = null;
    for (const e of arr) { if (e.t < tt) prev = e; else break; }
    if (!prev) return el('td', { class: 'klein-grau' }, '—');
    const d = temp - prev.temp;
    const pfeil = d > 0.2 ? '▲' : (d < -0.2 ? '▼' : '▶');
    const kl = d > 0.2 ? 'trend-auf' : (d < -0.2 ? 'trend-ab' : 'trend-gleich');
    return el('td', { class: 'trend ' + kl, title: 'gegenüber Vormessung' },
      pfeil + ' ' + (d > 0 ? '+' : '') + d.toFixed(1));
  }

  // ---- Excel-Export ----
  function jahrExportSteuerung() {
    const jahre = [...new Set(State.messreihen.map((r) => new Date(r.zeitpunkt).getFullYear()))]
      .filter((n) => !isNaN(n)).sort((a, b) => b - a);
    const sel = el('select', { id: 'export-jahr' });
    sel.append(el('option', { value: '' }, 'alle Jahre'));
    for (const j of jahre) sel.append(el('option', { value: String(j) }, String(j)));
    const btn = el('button', { class: 'btn klein', onclick: () => excelExport(sel.value ? Number(sel.value) : null) }, '⭳ Excel');
    return el('span', { class: 'export-jahr' }, sel, btn);
  }
  function excelExport(jahr) {
    try {
      const n = ExcelIO.exportiere(State.messreihen, ortById, stufeFuer, stelleNameVon, jahr);
      meldung(n + ' Messwerte als Excel exportiert.', 'ok');
    } catch (e) { meldung('Excel-Export: ' + e.message, 'fehler'); }
  }

  // ---- Backup / Wiederherstellen (JSON) ----
  function backupHerunterladen() {
    const daten = { app: 'heustockmessen', stand: new Date().toISOString(),
      messstellen: State.messstellen, messreihen: State.messreihen };
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'heustock-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function wiederherstellenSteuerung() {
    const inp = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: wiederherstellen });
    const btn = el('button', { class: 'btn klein', onclick: () => inp.click() }, '⭱ Wiederherstellen');
    return el('span', {}, btn, inp);
  }
  async function wiederherstellen(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const daten = JSON.parse(await file.text());
      if (!daten.messstellen || !daten.messreihen) throw new Error('Keine gültigen Heustock-Daten.');
      if (!confirm('Achtung: Der gesamte aktuelle Datenbestand wird durch das Backup ersetzt. Fortfahren?')) { e.target.value = ''; return; }
      await Api.restore({ messstellen: daten.messstellen, messreihen: daten.messreihen });
      await ladeDaten();
      renderAlles();
      meldung('Backup wiederhergestellt.', 'ok');
    } catch (err) {
      meldung('Wiederherstellen fehlgeschlagen: ' + err.message, 'fehler');
    }
    e.target.value = '';
  }

  // ---- Tagesbericht (HTML/PDF) ----
  function lokaleDatum(iso) {
    const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function tagLesbar(tag) {
    const d = new Date(tag + 'T00:00');
    return isNaN(d) ? tag : d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }
  function uhrzeit(iso) {
    const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function berichtSteuerung() {
    const letzte = State.messreihen[0] ? lokaleDatum(State.messreihen[0].zeitpunkt) : lokaleDatum(new Date().toISOString());
    const inp = el('input', { type: 'date', class: 'bericht-datum', value: letzte });
    const tagBtn = el('button', { class: 'btn klein', onclick: () => tagesbericht(inp.value) }, '📄 Tagesbericht');
    const gesamtBtn = el('button', { class: 'btn klein', onclick: gesamtbericht }, '📋 Gesamtbericht');
    const sel = el('select', { class: 'bericht-person' });
    sel.append(el('option', { value: '' }, '– Person –'));
    for (const n of erfasserNamen()) sel.append(el('option', { value: n }, n));
    const personBtn = el('button', { class: 'btn klein', onclick: () => personenbericht(sel.value) }, '👤 Personenbericht');
    return el('span', { class: 'bericht-steuerung' }, inp, tagBtn, gesamtBtn, sel, personBtn);
  }

  function druckeBericht(reihen, titel, untertitel) {
    const ziel = $('#bericht-druck');
    ziel.innerHTML = '';
    ziel.append(bauBericht(reihen, titel, untertitel));
    document.body.classList.add('drucke-bericht');
    window.print();
  }

  function tagesbericht(datum) {
    const reihen = State.messreihen.filter((r) => lokaleDatum(r.zeitpunkt) === datum);
    if (!reihen.length) { meldung('Für ' + tagLesbar(datum) + ' liegen keine Messungen vor.', 'fehler'); return; }
    druckeBericht(reihen, 'Tagesbericht', tagLesbar(datum));
  }

  function gesamtbericht() {
    const reihen = gefilterteReihen();
    if (!reihen.length) { meldung('Keine Messungen für den aktuellen Filter.', 'fehler'); return; }
    druckeBericht(reihen, 'Gesamtbericht', zeitraumText(reihen));
  }

  function personenbericht(name) {
    if (!name) { meldung('Bitte oben eine Person auswählen.', 'fehler'); return; }
    const reihen = State.messreihen.filter((r) => (r.messer || '') === name);
    if (!reihen.length) { meldung('Keine Messungen von ' + name + '.', 'fehler'); return; }
    druckeBericht(reihen, 'Bericht', 'Erfasser/in: ' + name + ' · ' + zeitraumText(reihen));
  }

  function zeitraumText(reihen) {
    const ds = reihen.map((r) => new Date(r.zeitpunkt).getTime());
    const von = lokaleDatum(new Date(Math.min(...ds)).toISOString());
    const bis = lokaleDatum(new Date(Math.max(...ds)).toISOString());
    return von === bis ? tagLesbar(von) : tagLesbar(von) + ' – ' + tagLesbar(bis);
  }

  function berichtDatumZeit(iso) {
    const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + uhrzeit(iso);
  }

  function bSummary(label, wert) {
    return el('div', { class: 'b-sum' }, el('div', { class: 'b-sum-l' }, label), el('div', { class: 'b-sum-w' }, wert));
  }

  // Werte-Tabelle einer Messreihe (nach Halle gruppiert) für den Bericht.
  function bauWerteTabelle(r) {
    const grp = new Map();
    for (const w of r.messwerte) {
      const info = ortById(w.ort_id); const hn = info ? info.halle.name : '—';
      if (!grp.has(hn)) grp.set(hn, []);
      grp.get(hn).push({ w, info });
    }
    const tab = el('table', { class: 'b-tab' });
    tab.append(el('tr', {}, ...['Halle', 'Ort', 'Tiefe/Pos.', 'Temperatur', 'Bewertung', 'Notiz'].map((h) => el('th', {}, h))));
    for (const [hn, eintraege] of grp) {
      eintraege.forEach(({ w, info }, i) => {
        const st = stufeFuer(w.temperatur);
        tab.append(el('tr', { class: st ? 's-' + st.klasse : '' },
          el('td', {}, i === 0 ? hn : ''),
          el('td', {}, info ? info.ort.bezeichnung : ('#' + w.ort_id)),
          el('td', {}, w.tiefe || ''),
          el('td', { class: 'num' }, w.temperatur != null ? w.temperatur.toFixed(1) + ' °C' : '—'),
          el('td', {}, el('span', { class: 'b-dot ' + (st ? 's-' + st.klasse : '') }), st ? st.titel : ''),
          el('td', {}, w.notiz || '')));
      });
    }
    return tab;
  }

  function bauBericht(reihen, titel, untertitel) {
    const frag = document.createDocumentFragment();
    frag.append(el('div', { class: 'b-kopf' },
      el('div', {},
        el('div', { class: 'b-logo' }, '🚒 Freiwillige Feuerwehr'),
        el('h1', {}, 'Heustock – ' + titel)),
      el('div', { class: 'b-datum' }, untertitel)));

    // Zusammenfassung über alle Messreihen
    let maxT = -Infinity, kritisch = 0; const stellen = new Set();
    for (const r of reihen) {
      stellen.add(r.messstelle_id || (r.messwerte[0] ? ortById(r.messwerte[0].ort_id)?.stelle.id : null));
      for (const w of r.messwerte) {
        if (w.temperatur != null) { if (w.temperatur > maxT) maxT = w.temperatur; if (w.temperatur >= SCHWELLEN.orange) kritisch++; }
      }
    }
    const stMax = stufeFuer(maxT === -Infinity ? null : maxT);
    frag.append(el('div', { class: 'b-summary' },
      bSummary('Messungen', String(reihen.length)),
      bSummary('Messstellen', String(stellen.size)),
      bSummary('Höchstwert', maxT === -Infinity ? '–' : maxT.toFixed(1) + ' °C' + (stMax ? ' · ' + stMax.titel : '')),
      bSummary('Kritische Werte (≥ ' + SCHWELLEN.orange + '°)', String(kritisch))));

    // Nach Messstelle gruppieren, innerhalb chronologisch
    const grp = new Map();
    for (const r of [...reihen].sort((a, b) => new Date(a.zeitpunkt) - new Date(b.zeitpunkt))) {
      const stelle = r.messstelle_id ? stelleById(r.messstelle_id)
        : (r.messwerte[0] ? ortById(r.messwerte[0].ort_id)?.stelle : null);
      const key = stelle ? stelle.id : 0;
      if (!grp.has(key)) grp.set(key, { stelle, rs: [] });
      grp.get(key).rs.push(r);
    }
    for (const { stelle, rs } of grp.values()) {
      const sec = el('section', { class: 'b-stelle' });
      sec.append(el('h2', {}, (stelle ? stelle.name : '—') + ' ', el('span', { class: 'b-anzahl' }, '(' + rs.length + ' Messung' + (rs.length === 1 ? '' : 'en') + ')')));
      for (const r of rs) {
        const mess = el('div', { class: 'b-mess' });
        mess.append(el('div', { class: 'b-meta' },
          berichtDatumZeit(r.zeitpunkt)
          + (r.messer ? ' · ' + r.messer : '')
          + (r.aussentemperatur != null ? ' · außen ' + r.aussentemperatur + ' °C' + (r.temp_quelle === 'open-meteo' ? ' (autom.)' : '') : '')));
        mess.append(bauWerteTabelle(r));
        if (r.notiz) mess.append(el('div', { class: 'b-notiz' }, 'Notiz: ' + r.notiz));
        if (r.foto) mess.append(el('img', { class: 'b-foto', src: r.foto, alt: 'Beleg' }));
        sec.append(mess);
      }
      frag.append(sec);
    }

    frag.append(el('div', { class: 'b-fuss' },
      el('div', { class: 'b-sign' }, 'Kontrolliert: ', el('span', { class: 'b-line' })),
      el('div', { class: 'b-sign' }, 'Unterschrift: ', el('span', { class: 'b-line' }))));
    frag.append(el('div', { class: 'b-gen' }, 'Erstellt am ' + new Date().toLocaleString('de-DE')));
    return frag;
  }

  // ======================================================================
  //  Ansicht 4: Diagramm (Temperaturverlauf je Ort)
  // ======================================================================
  function renderDiagramm() {
    const wrap = $('#view-diagramm');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.append(el('h2', {}, '📈 Temperaturverlauf'));

    if (!State.messstellen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Noch keine Messstellen.'));
      return;
    }
    if (!State.diagrammStelleId || !stelleById(State.diagrammStelleId)) {
      State.diagrammStelleId = State.messstellen[0].id;
    }
    const stelle = stelleById(State.diagrammStelleId);

    const selStelle = el('select', { onchange: (e) => { State.diagrammStelleId = Number(e.target.value); State.diagrammHalleId = ''; renderDiagramm(); } });
    for (const s of State.messstellen)
      selStelle.append(el('option', { value: String(s.id), ...(s.id === stelle.id ? { selected: '' } : {}) }, s.name));

    const selHalle = el('select', { onchange: (e) => { State.diagrammHalleId = e.target.value; renderDiagramm(); } });
    selHalle.append(el('option', { value: '' }, 'Alle Hallen'));
    for (const h of (stelle.hallen || []))
      selHalle.append(el('option', { value: String(h.id), ...(String(h.id) === State.diagrammHalleId ? { selected: '' } : {}) }, h.name));

    wrap.append(el('div', { class: 'diag-steuerung' }, feld('Messstelle', selStelle), feld('Halle', selHalle)));

    // Eine Serie je Ort im gewählten Bereich
    const timelines = ortTimelines();
    const hallen = State.diagrammHalleId
      ? (stelle.hallen || []).filter((h) => String(h.id) === State.diagrammHalleId)
      : (stelle.hallen || []);
    const serien = [];
    let idx = 0;
    for (const h of hallen) {
      for (const o of (h.orte || [])) {
        const pts = timelines.get(o.id);
        if (!pts || !pts.length) continue;
        serien.push({
          label: (hallen.length > 1 ? h.name + ' · ' : '') + o.bezeichnung,
          farbe: DIAG_FARBEN[idx % DIAG_FARBEN.length],
          points: pts,
        });
        idx++;
      }
    }
    if (!serien.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Für diese Auswahl liegen noch keine Messwerte vor.'));
      return;
    }

    wrap.append(el('div', { class: 'chart-box' }, svgMultiChart(serien)));

    // Legende der Orte (Farbe → Ort)
    const leg = el('div', { class: 'diag-legende' });
    for (const s of serien)
      leg.append(el('span', { class: 'diag-leg-eintrag' },
        el('span', { class: 'diag-leg-punkt', style: 'background:' + s.farbe }), s.label));
    wrap.append(leg);
    wrap.append(legende());
  }

  // Weicher Bezier-Pfad (Catmull-Rom) durch die Punkte.
  function glättePfad(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  // Mehrlinien-Diagramm mit farbigen Gefahren-Zonen, weichen Linien und
  // End-Wert-Labels – optisch ansprechend statt schlichter Liniengrafik.
  function svgMultiChart(serien) {
    const W = 720, H = 340, pad = { l: 46, r: 52, t: 18, b: 42 };
    const alleX = serien.flatMap((s) => s.points.map((p) => p.t));
    const alleY = serien.flatMap((s) => s.points.map((p) => p.temp));
    const minX = Math.min(...alleX), maxX = Math.max(...alleX);
    const minY = Math.min(0, ...alleY);
    const maxY = Math.ceil((Math.max(...alleY, 80) + 5) / 10) * 10;
    const sx = (t) => pad.l + (maxX === minX ? 0.5 : (t - minX) / (maxX - minX)) * (W - pad.l - pad.r);
    const sy = (v) => H - pad.b - (v - minY) / (maxY - minY) * (H - pad.t - pad.b);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    const mk = (name, attrs, txt, parent) => {
      const n = document.createElementNS(ns, name);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (txt != null) n.textContent = txt;
      (parent || svg).append(n);
      return n;
    };

    // Farbige Gefahren-Zonen als Hintergrundbänder
    const bands = [
      { von: minY, bis: SCHWELLEN.gelb, farbe: 'rgba(46,125,50,.08)' },
      { von: SCHWELLEN.gelb, bis: SCHWELLEN.orange, farbe: 'rgba(201,162,39,.15)' },
      { von: SCHWELLEN.orange, bis: SCHWELLEN.rot, farbe: 'rgba(232,116,12,.15)' },
      { von: SCHWELLEN.rot, bis: maxY, farbe: 'rgba(211,47,47,.15)' },
    ];
    for (const b of bands) {
      const y1 = sy(Math.min(maxY, b.bis)), y2 = sy(Math.max(minY, b.von));
      if (y2 - y1 > 0.5) mk('rect', { x: pad.l, y: y1, width: W - pad.l - pad.r, height: y2 - y1, fill: b.farbe });
    }

    // Waagerechte Gitterlinien an den Y-Ticks
    for (let v = Math.ceil(minY / 20) * 20; v <= maxY; v += 20) {
      mk('line', { x1: pad.l, y1: sy(v), x2: W - pad.r, y2: sy(v), class: 'grid' });
      mk('text', { x: pad.l - 8, y: sy(v) + 4, class: 'tick', 'text-anchor': 'end' }, v + '°');
    }
    // Schwellen-Beschriftung am rechten Rand
    for (const st of STUFEN) {
      if (st.ab === -Infinity) continue;
      const y = sy(st.ab);
      if (y > pad.t + 6 && y < H - pad.b - 2)
        mk('text', { x: W - pad.r + 6, y: y + 4, class: 'schwelle-lbl s-' + st.klasse, 'text-anchor': 'start' }, st.ab + '°');
    }
    // Achsen
    mk('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: H - pad.b, class: 'achse' });
    mk('line', { x1: pad.l, y1: H - pad.b, x2: W - pad.r, y2: H - pad.b, class: 'achse' });
    [minX, maxX].forEach((t, i) => {
      const d = new Date(t);
      mk('text', { x: sx(t), y: H - pad.b + 17, class: 'tick', 'text-anchor': i === 0 ? 'start' : 'end' },
        ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.');
    });

    // Serien: weiche Linie + Punkte + End-Label
    for (const s of serien) {
      const pts = s.points.map((p) => ({ x: sx(p.t), y: sy(p.temp) }));
      if (pts.length > 1) mk('path', { class: 'linie', d: glättePfad(pts), style: 'stroke:' + s.farbe });
      s.points.forEach((p, i) => {
        const c = mk('circle', { cx: pts[i].x, cy: pts[i].y, r: 4, class: 'pkt', style: 'fill:' + s.farbe });
        const ti = document.createElementNS(ns, 'title');
        ti.textContent = s.label + ' · ' + zeitLesbar(new Date(p.t).toISOString()) + ': ' + p.temp.toFixed(1) + ' °C';
        c.append(ti);
      });
      // letzter Wert als Label am Linienende
      const last = s.points[s.points.length - 1], lx = pts[pts.length - 1].x, ly = pts[pts.length - 1].y;
      mk('text', { x: Math.min(lx + 7, W - 4), y: ly + 4, class: 'end-label', style: 'fill:' + s.farbe, 'text-anchor': 'start' },
        last.temp.toFixed(0) + '°');
    }
    return svg;
  }

  // ======================================================================
  //  Ansicht 0: Start-Dashboard (Übersicht aller Messstellen)
  // ======================================================================
  function letzteReiheFuer(stelleId) {
    return State.messreihen.find((r) => {
      const sid = r.messstelle_id || (r.messwerte[0] ? (ortById(r.messwerte[0].ort_id)?.stelle.id) : null);
      return sid === stelleId;
    });
  }

  function tageHer(iso) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  // Empfohlenes Kontrollintervall (Tage) je Stufe – einfache Faustregel.
  function intervallTage(stufe) {
    if (!stufe) return 14;
    return { rot: 0, orange: 1, gelb: 3, gruen: 7 }[stufe.klasse] ?? 7;
  }

  function dashInfo(stelle) {
    const r = letzteReiheFuer(stelle.id);
    const orteGesamt = (stelle.hallen || []).reduce((n, h) => n + (h.orte || []).length, 0);
    let maxTemp = null, stufe = null, tage = null, gemessen = 0;
    if (r) {
      maxTemp = r.messwerte.reduce((m, w) => (w.temperatur != null && w.temperatur > m ? w.temperatur : m), -Infinity);
      if (maxTemp === -Infinity) maxTemp = null;
      stufe = stufeFuer(maxTemp);
      tage = tageHer(r.zeitpunkt);
      gemessen = r.messwerte.filter((w) => w.temperatur != null).length;
    }
    const faellig = !r || tage >= intervallTage(stufe);
    return { stelle, r, maxTemp, stufe, tage, orteGesamt, gemessen, faellig };
  }

  function renderDashboard() {
    const wrap = $('#view-dashboard');
    if (!wrap) return;
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'verlauf-kopf' },
      el('h2', {}, '🏠 Übersicht'),
      el('div', { class: 'werkzeuge' },
        el('span', { class: 'klein-grau' }, 'Schwellen: ' + (SCHWELLEN.material || 'Heu')
          + ` (${SCHWELLEN.gelb}/${SCHWELLEN.orange}/${SCHWELLEN.rot} °C)`),
        el('button', { class: 'btn klein', onclick: schwellenDialogOeffnen }, '⚙ Schwellenwerte'),
      )));

    if (!State.messstellen.length) {
      wrap.append(el('div', { class: 'leer' }, 'Noch keine Messstellen. Legen Sie im Reiter ',
        el('strong', {}, 'Messstellen'), ' Messstellen, Hallen und Orte an.'));
      return;
    }

    // kritischste/fällige zuerst
    const infos = State.messstellen.map(dashInfo).sort((a, b) => {
      const av = a.maxTemp == null ? -1 : a.maxTemp, bv = b.maxTemp == null ? -1 : b.maxTemp;
      return (b.faellig - a.faellig) || (bv - av);
    });
    const grid = el('div', { class: 'dash-grid' });
    for (const i of infos) grid.append(dashKarte(i));
    wrap.append(grid);
  }

  function dashKarte(i) {
    const s = i.stelle;
    const karte = el('section', { class: 'dash-karte' + (i.stufe ? ' s-' + i.stufe.klasse : '') });
    karte.append(el('div', { class: 'dash-kopf' },
      el('strong', {}, s.name),
      i.stufe ? el('span', { class: 'badge s-' + i.stufe.klasse }, i.maxTemp.toFixed(1) + ' °C') : el('span', { class: 'klein-grau' }, 'keine Messung')));

    if (i.r) {
      karte.append(el('div', { class: 'dash-zeile' }, i.stufe.titel));
      karte.append(el('div', { class: 'dash-zeile klein-grau' },
        'zuletzt: ' + (i.tage === 0 ? 'heute' : 'vor ' + i.tage + ' Tag' + (i.tage === 1 ? '' : 'en'))
        + ' · ' + i.gemessen + '/' + i.orteGesamt + ' Orte'));
    } else {
      karte.append(el('div', { class: 'dash-zeile klein-grau' }, i.orteGesamt + ' Orte angelegt'));
    }
    if (i.faellig) karte.append(el('div', { class: 'dash-faellig' }, '⏰ Kontrolle fällig'));

    karte.append(el('div', { class: 'dash-aktionen' },
      el('button', { class: 'btn klein primaer', onclick: () => starteMessungFuer(s.id) }, '➕ Messen'),
      el('button', { class: 'btn klein', onclick: () => { State.filter = { stelleId: String(s.id), halleId: '', von: '', bis: '', nurKritisch: false }; renderVerlauf(); zeigeView('verlauf'); } }, 'Verlauf'),
    ));
    return karte;
  }

  function starteMessungFuer(stelleId) {
    State.editReiheId = null;
    State.werte = {};
    State.kopf = leererKopf();
    State.wizardStelleId = stelleId;
    State.wizardSchritt = 0;
    renderMessung();
    zeigeView('messung');
  }

  // ---- Schwellenwerte konfigurieren ----
  function schwellenDialogOeffnen() {
    $('#sw-gelb').value = SCHWELLEN.gelb;
    $('#sw-orange').value = SCHWELLEN.orange;
    $('#sw-rot').value = SCHWELLEN.rot;
    $('#sw-material').textContent = SCHWELLEN.material || 'Heu';
    $('#sw-fehler').hidden = true;
    $('#schwellen-overlay').hidden = false;
  }
  function schwellenPreset(material) {
    if (material === 'Stroh') { $('#sw-gelb').value = 40; $('#sw-orange').value = 55; $('#sw-rot').value = 65; }
    else { $('#sw-gelb').value = 45; $('#sw-orange').value = 60; $('#sw-rot').value = 70; }
    $('#sw-material').textContent = material;
  }
  async function schwellenSpeichern() {
    const g = parseFloat($('#sw-gelb').value), o = parseFloat($('#sw-orange').value), r = parseFloat($('#sw-rot').value);
    const f = $('#sw-fehler');
    if (isNaN(g) || isNaN(o) || isNaN(r) || !(g < o && o < r)) {
      f.hidden = false; f.textContent = 'Bitte Zahlen mit gelb < orange < rot eingeben.'; return;
    }
    try {
      await Api.schwellenSet({ gelb: g, orange: o, rot: r, material: $('#sw-material').textContent });
      $('#schwellen-overlay').hidden = true;
      await ladeDaten();
      renderAlles();
      meldung('Schwellenwerte gespeichert (' + g + '/' + o + '/' + r + ' °C).', 'ok');
    } catch (e) { f.hidden = false; f.textContent = e.message; }
  }

  // ======================================================================
  //  Offline-Puffer + Live-Update
  // ======================================================================
  const Offline = (() => {
    const KEY = 'heustock_queue';
    const list = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
    const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* voll */ } };
    return {
      list, count: () => list().length,
      add: (daten) => { const a = list(); a.push({ ...daten, _ts: Date.now() }); save(a); },
      async sync() {
        const a = list();
        if (!a.length) return { ok: 0, rest: 0 };
        let ok = 0; const rest = [];
        for (const d of a) {
          try { await Api.messreiheSave(d); ok++; } catch (e) { rest.push(d); }
        }
        save(rest);
        return { ok, rest: rest.length };
      },
    };
  })();

  function aktualisiereOfflineStatus() {
    const b = $('#offline-status');
    const n = Offline.count();
    b.hidden = n === 0;
    b.textContent = '⏳ ' + n + ' offline';
    b.title = n + ' Messung(en) warten auf Übertragung – klicken zum Synchronisieren.';
  }

  async function syncOffline() {
    if (!Offline.count()) return;
    const r = await Offline.sync();
    aktualisiereOfflineStatus();
    if (r.ok) {
      await ladeDaten();
      renderAlles();
      meldung(r.ok + ' Messung(en) synchronisiert.' + (r.rest ? ' ' + r.rest + ' noch offen.' : ''), r.rest ? 'info' : 'ok');
    } else if (r.rest) {
      meldung(r.rest + ' Messung(en) konnten nicht übertragen werden (Server/Anmeldung prüfen).', 'fehler');
    }
  }

  let pollTimer = null;
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollStand, 15000);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  async function pollStand() {
    if (document.hidden || !State.online) return;
    try {
      const s = await Api.stand();
      if (s.rev !== State.rev) {
        // Erfassung nicht stören: nicht neu rendern, solange die Messansicht
        // sichtbar ist oder bereits Werte/Schritte erfasst wurden.
        const messungSichtbar = !$('#view-messung').hidden;
        const messendAktiv = messungSichtbar || State.wizardSchritt > 0 || Object.keys(State.werte).length > 0;
        await ladeDaten();
        renderDashboard();
        renderVerlauf();
        renderMessstellen();
        renderDiagramm();
        if (!messendAktiv) renderMessung();
        meldung('Daten aktualisiert (Änderung durch andere Nutzer).', 'info');
      }
    } catch (e) { /* vermutlich offline – ignorieren */ }
  }

  // ======================================================================
  //  Anmeldung / Passwort
  // ======================================================================
  function zeigeLogin(an) {
    $('#login-overlay').hidden = !an;
    $('#app').hidden = an;
    if (an) setTimeout(() => $('#login-pass').focus(), 50);
  }

  async function pruefeAnmeldung() {
    try {
      const s = await Api.status();
      if (s.angemeldet) {
        zeigeLogin(false);
        await starteApp();
      } else {
        zeigeLogin(true);
      }
    } catch (e) {
      zeigeLogin(true);
      const f = $('#login-fehler');
      f.hidden = false;
      f.textContent = 'Server nicht erreichbar – läuft die Seite auf einem PHP-Server? (' + e.message + ')';
    }
  }

  async function login() {
    const f = $('#login-fehler');
    f.hidden = true;
    const pass = $('#login-pass').value;
    if (!pass) return;
    $('#login-btn').disabled = true;
    try {
      await Api.login(pass);
      $('#login-pass').value = '';
      zeigeLogin(false);
      await starteApp();
    } catch (e) {
      f.hidden = false;
      f.textContent = e.message;
    } finally {
      $('#login-btn').disabled = false;
    }
  }

  async function logout() {
    stopPolling();
    try { await Api.logout(); } catch (e) { /* egal */ }
    zeigeLogin(true);
  }

  function pwDialog(an) {
    $('#pw-overlay').hidden = !an;
    if (an) {
      $('#pw-alt').value = $('#pw-neu').value = $('#pw-neu2').value = '';
      $('#pw-fehler').hidden = true;
      setTimeout(() => $('#pw-alt').focus(), 50);
    }
  }

  async function pwSpeichern() {
    const f = $('#pw-fehler');
    f.hidden = true;
    const alt = $('#pw-alt').value, neu = $('#pw-neu').value, neu2 = $('#pw-neu2').value;
    if (neu !== neu2) { f.hidden = false; f.textContent = 'Die neuen Passwörter stimmen nicht überein.'; return; }
    if (neu.length < 6) { f.hidden = false; f.textContent = 'Mindestens 6 Zeichen.'; return; }
    try {
      await Api.passwortAendern(alt, neu);
      pwDialog(false);
      meldung('Passwort geändert.', 'ok');
    } catch (e) {
      f.hidden = false; f.textContent = e.message;
    }
  }

  // ======================================================================
  //  Navigation / Init
  // ======================================================================
  function zeigeView(name) {
    $$('.view').forEach((v) => { v.hidden = v.id !== 'view-' + name; });
    $$('.nav-btn').forEach((b) => {
      const aktiv = b.dataset.view === name;
      b.classList.toggle('aktiv', aktiv);
      if (aktiv) b.scrollIntoView({ inline: 'center', block: 'nearest' });
    });
    window.scrollTo({ top: 0 });
  }

  function renderAlles() {
    renderDashboard();
    renderMessung();
    renderMessstellen();
    renderVerlauf();
    renderDiagramm();
  }

  async function starteApp() {
    await ladeDaten();
    renderAlles();
    aktualisiereOfflineStatus();
    await syncOffline();
    startPolling();
  }

  // ---- PWA-Installation ----
  let installPrompt = null;
  function zeigeInstallBanner(an) {
    const b = $('#install-banner');
    if (!b) return;
    const verworfen = (() => { try { return localStorage.getItem('heustock_install_dismiss') === '1'; } catch (e) { return false; } })();
    b.hidden = !(an && installPrompt && !verworfen);
  }
  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch (e) { /* egal */ }
    installPrompt = null;
    zeigeInstallBanner(false);
  }

  async function init() {
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => zeigeView(b.dataset.view)));
    zeigeView('dashboard');

    $('#login-form').addEventListener('submit', login);
    $('#sw-speichern').addEventListener('click', schwellenSpeichern);
    $('#sw-abbrechen').addEventListener('click', () => { $('#schwellen-overlay').hidden = true; });
    $('#sw-heu').addEventListener('click', () => schwellenPreset('Heu'));
    $('#sw-stroh').addEventListener('click', () => schwellenPreset('Stroh'));
    $('#login-btn').addEventListener('click', login);
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-einstellungen').addEventListener('click', () => pwDialog(true));
    $('#pw-speichern').addEventListener('click', pwSpeichern);
    $('#pw-abbrechen').addEventListener('click', () => pwDialog(false));

    window.addEventListener('beforeprint', () => $$('#view-verlauf details').forEach((d) => (d.open = true)));
    window.addEventListener('afterprint', () => document.body.classList.remove('drucke-bericht'));

    // PWA-Installation anbieten
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; zeigeInstallBanner(true); });
    window.addEventListener('appinstalled', () => { installPrompt = null; zeigeInstallBanner(false); meldung('App installiert.', 'ok'); });
    $('#install-btn').addEventListener('click', installApp);
    $('#install-dismiss').addEventListener('click', () => {
      try { localStorage.setItem('heustock_install_dismiss', '1'); } catch (e) { /* egal */ }
      zeigeInstallBanner(false);
    });

    // Offline-Puffer: Anzeige, manuelles Synchronisieren, Auto-Sync bei Netz
    $('#offline-status').addEventListener('click', syncOffline);
    window.addEventListener('online', () => { syncOffline(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollStand(); });
    aktualisiereOfflineStatus();

    await pruefeAnmeldung();
  }

  return { init, _STUFEN: STUFEN, stufeFuer };
})();

document.addEventListener('DOMContentLoaded', App.init);
