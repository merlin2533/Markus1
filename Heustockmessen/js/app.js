/**
 * App – UI-Verdrahtung für die Heustockmessung.
 * Reine Vanilla-JS-SPA; Persistenz läuft serverseitig über Api (api.php / SQLite).
 * Hierarchie: Messstelle → Halle → Ort. Erfassung als geführter Ablauf.
 */
const App = (() => {

  // --- Warnstufen (Ampel) -------------------------------------------------
  // Übliche Richtwerte der Heustock-Temperaturüberwachung. Bei Bedarf hier
  // zentral anpassen.
  const STUFEN = [
    { ab: 70,         klasse: 'rot',    titel: 'Akute Brandgefahr',
      hinweis: 'Sofort Feuerwehr/Fachberater verständigen – Heu nur unter Aufsicht und Brandschutz ausräumen.' },
    { ab: 60,         klasse: 'orange', titel: 'Kritisch',
      hinweis: 'Engmaschig (z. B. alle 2 Std.) kontrollieren, Feuerwehr informieren, Ausräumen vorbereiten.' },
    { ab: 45,         klasse: 'gelb',   titel: 'Erhöht',
      hinweis: 'Beginnende Selbsterhitzung – täglich kontrollieren und dokumentieren.' },
    { ab: -Infinity,  klasse: 'gruen',  titel: 'Unbedenklich',
      hinweis: 'Normaler Bereich.' },
  ];

  function stufeFuer(t) {
    if (t === null || t === undefined || isNaN(t)) return null;
    return STUFEN.find((s) => t >= s.ab);
  }

  // --- Zustand ------------------------------------------------------------
  const State = {
    messstellen: [],
    messreihen: [],
    online: false,
    editReiheId: null,       // null = neue Reihe, sonst bestehende bearbeiten
    werte: {},               // ort_id -> { temperatur, notiz }
    wizardStelleId: null,    // aktuell gewählte Messstelle
    wizardSchritt: 0,        // 0 = Kopf, 1..H = Hallen, H+1 = Übersicht
    kopf: leererKopf(),      // Kopfdaten der Messung (über Schritte hinweg)
  };

  function leererKopf() {
    return {
      zeitpunkt: '', messer: '', notiz: '',
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

    form.append(
      feld('Messstelle (Anfahrt)', sel),
      feld('Zeitpunkt', fZeit),
      feld('Erfasser/in', fMesser, dl),
      feld('Außentemperatur', el('span', { class: 'temp-zeile' }, fTemp, el('span', {}, '°C'), wetterBtn, fQuelle)),
      feld('Notiz', fNotiz),
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
      wrap.append(tab);
    }
    if (!anzahl) {
      wrap.append(el('div', { class: 'leer hinweis' }, 'Noch keine Temperaturwerte erfasst.'));
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
    const input = el('input', {
      type: 'number', step: '0.1', inputmode: 'decimal', class: 'temp-feld', placeholder: '°C',
      'data-ort': ort.id, value: vorhanden.temperatur ?? '',
    });
    const badge = el('span', { class: 'badge' });
    const upd = () => {
      const t = input.value === '' ? null : parseFloat(input.value);
      State.werte[ort.id] = { ...(State.werte[ort.id] || {}), temperatur: input.value === '' ? null : t };
      const st = stufeFuer(t);
      input.className = 'temp-feld' + (st ? ' s-' + st.klasse : '');
      badge.className = 'badge' + (st ? ' s-' + st.klasse : '');
      badge.textContent = st && t !== null ? st.titel : '';
      badge.title = st ? st.hinweis : '';
    };
    input.addEventListener('input', upd);
    const z = el('div', { class: 'ebene-zeile' },
      el('label', { class: 'ebene-name' }, ort.bezeichnung), input, el('span', {}, '°C'), badge);
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
      const von = s.ab === -Infinity ? '< 45' : '≥ ' + s.ab;
      l.append(el('span', { class: 'leg-eintrag s-' + s.klasse, title: s.hinweis },
        el('span', { class: 'leg-punkt' }), `${von} °C – ${s.titel}`));
    }
    return l;
  }

  async function holeWetter() {
    const quelle = $('#m-quelle');
    quelle.textContent = '… Standort wird ermittelt';
    try {
      const w = await Wetter.aktuelleTemperatur();
      $('#m-temp').value = w.temperatur.toFixed(1);
      quelle.textContent = 'auto · ' + w.text;
      quelle.dataset.lat = w.lat;
      quelle.dataset.lon = w.lon;
      quelle.dataset.quelle = w.quelle;
      meldung('Außentemperatur automatisch übernommen: ' + w.temperatur.toFixed(1) + ' °C', 'ok');
    } catch (e) {
      quelle.textContent = 'manuell';
      meldung('Automatik fehlgeschlagen: ' + e.message + ' – bitte manuell eingeben.', 'fehler');
    }
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
      .filter(([, v]) => v && v.temperatur !== null && v.temperatur !== undefined && !isNaN(v.temperatur))
      .map(([ort_id, v]) => ({ ort_id: Number(ort_id), temperatur: v.temperatur, notiz: v.notiz || '' }));

    if (!werte.length) {
      meldung('Bitte mindestens einen Temperaturwert eingeben.', 'fehler');
      return;
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
      meldung('Speichern fehlgeschlagen: ' + e.message, 'fehler');
    }
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
      el('button', { class: 'btn klein gefahr', onclick: () => {
        if (confirm('Messstelle „' + stelle.name + '" inkl. aller Hallen, Orte und Messwerte löschen?'))
          aktion(() => Api.messstelleDelete(stelle.id));
      } }, 'Löschen'),
    ));

    // Hallen
    const hallenBox = el('div', { class: 'hallen-box' });
    for (const halle of (stelle.hallen || [])) {
      hallenBox.append(halleBlock(stelle, halle));
    }
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

  function halleBlock(stelle, halle) {
    const block = el('div', { class: 'halle-block' });
    const hName = el('input', { type: 'text', class: 'inline-edit', value: halle.name });
    block.append(el('div', { class: 'halle-kopf' },
      el('span', { class: 'ebene-tag halle' }, 'Halle'),
      hName,
      el('button', { class: 'btn mini', onclick: () =>
        aktion(() => Api.halleSave({ id: halle.id, messstelle_id: stelle.id, name: hName.value.trim() })) }, '✓'),
      el('button', { class: 'btn mini gefahr', onclick: () => {
        if (confirm('Halle „' + halle.name + '" inkl. Orte und Messwerte löschen?'))
          aktion(() => Api.halleDelete(halle.id));
      } }, '✕'),
    ));

    const orte = el('div', { class: 'orte-liste' });
    for (const ort of (halle.orte || [])) {
      const inO = el('input', { type: 'text', class: 'inline-edit', value: ort.bezeichnung });
      orte.append(el('div', { class: 'ort-edit' },
        inO,
        el('button', { class: 'btn mini', onclick: () =>
          aktion(() => Api.ortSave({ id: ort.id, halle_id: halle.id, bezeichnung: inO.value.trim() })) }, '✓'),
        el('button', { class: 'btn mini gefahr', onclick: () => {
          if (confirm('Ort „' + ort.bezeichnung + '" löschen?')) aktion(() => Api.ortDelete(ort.id));
        } }, '✕'),
      ));
    }
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

  // ======================================================================
  //  Ansicht 3: Verlauf / Auswertung
  // ======================================================================
  function renderVerlauf() {
    const wrap = $('#view-verlauf');
    wrap.innerHTML = '';
    wrap.append(el('div', { class: 'verlauf-kopf' },
      el('h2', {}, 'Verlauf & Auswertung'),
      el('button', { class: 'btn klein', onclick: () => window.print() }, '🖨 Drucken / PDF'),
    ));

    if (!State.messreihen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Noch keine Messungen erfasst.'));
      return;
    }

    for (const r of State.messreihen) {
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
        el('th', {}, 'Temperatur'), el('th', {}, 'Bewertung'), el('th', {}, 'Notiz')));
      for (const [halleName, eintraege] of gruppen) {
        eintraege.forEach(({ w, info }, i) => {
          const st = stufeFuer(w.temperatur);
          tab.append(el('tr', { class: st ? 's-' + st.klasse : '' },
            el('td', { class: 'halle-zelle' }, i === 0 ? halleName : ''),
            el('td', {}, info ? info.ort.bezeichnung : ('Ort #' + w.ort_id)),
            el('td', { class: 'num' }, w.temperatur != null ? w.temperatur.toFixed(1) + ' °C' : '—'),
            el('td', {}, st ? st.titel : ''),
            el('td', {}, w.notiz || '')));
        });
      }
      det.append(tab);

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
      State.werte[w.ort_id] = { temperatur: w.temperatur, notiz: w.notiz || '' };
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
      aussentemperatur: r.aussentemperatur != null ? String(r.aussentemperatur) : '',
      temp_quelle: r.temp_quelle || 'manuell',
      geo_lat: r.geo_lat, geo_lon: r.geo_lon, wetter_text: r.wetter_text || '',
    };
    zeigeView('messung');
    renderMessung();
    meldung('Messung wird bearbeitet.', 'info');
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
    $$('.nav-btn').forEach((b) => b.classList.toggle('aktiv', b.dataset.view === name));
  }

  function renderAlles() {
    renderMessung();
    renderMessstellen();
    renderVerlauf();
  }

  async function starteApp() {
    await ladeDaten();
    renderAlles();
  }

  async function init() {
    $$('.nav-btn').forEach((b) => b.addEventListener('click', () => zeigeView(b.dataset.view)));
    zeigeView('messung');

    $('#login-form').addEventListener('submit', login);
    $('#login-btn').addEventListener('click', login);
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-einstellungen').addEventListener('click', () => pwDialog(true));
    $('#pw-speichern').addEventListener('click', pwSpeichern);
    $('#pw-abbrechen').addEventListener('click', () => pwDialog(false));

    window.addEventListener('beforeprint', () => $$('#view-verlauf details').forEach((d) => (d.open = true)));

    await pruefeAnmeldung();
  }

  return { init, _STUFEN: STUFEN, stufeFuer };
})();

document.addEventListener('DOMContentLoaded', App.init);
