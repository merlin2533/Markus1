/**
 * App – UI-Verdrahtung für die Heustockmessung.
 * Reine Vanilla-JS-SPA; Persistenz läuft serverseitig über Api (api.php / SQLite).
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
    werte: {},               // ebene_id -> { temperatur, notiz }
  };

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

  function escape(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    // Für <input type="datetime-local"> (ohne Sekunden, lokale Zeitzone).
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

  function ebeneById(id) {
    for (const s of State.messstellen) {
      const e = (s.ebenen || []).find((x) => x.id === id);
      if (e) return { ebene: e, stelle: s };
    }
    return null;
  }

  // ======================================================================
  //  Ansicht 1: Messung erfassen
  // ======================================================================
  function renderMessung() {
    const wrap = $('#view-messung');
    wrap.innerHTML = '';

    if (!State.messstellen.length) {
      wrap.append(el('div', { class: 'leer' },
        'Noch keine Messstellen angelegt. Wechseln Sie zum Reiter ',
        el('strong', {}, 'Messstellen'), ', um Messstellen und Ebenen (Oben/Mitte/Unten) anzulegen.'));
      return;
    }

    // Kopf: Zeitpunkt, Messer, Außentemperatur + Wetter holen
    const form = el('form', { class: 'mess-kopf', onsubmit: (e) => e.preventDefault() });

    const fZeit = el('input', { type: 'datetime-local', id: 'm-zeit', value: lokaleZeit() });
    const fMesser = el('input', { type: 'text', id: 'm-messer', placeholder: 'Name', autocomplete: 'name' });
    const fTemp = el('input', { type: 'number', id: 'm-temp', step: '0.1', placeholder: '°C', class: 'temp-feld' });
    const fQuelle = el('span', { id: 'm-quelle', class: 'quelle' }, 'manuell');
    const wetterBtn = el('button', { type: 'button', class: 'btn klein', onclick: holeWetter }, '⤓ Standort/Wetter');
    fTemp.addEventListener('input', () => { fQuelle.textContent = 'manuell'; fQuelle.dataset.lat = ''; fQuelle.dataset.lon = ''; });

    const fNotiz = el('input', { type: 'text', id: 'm-notiz', placeholder: 'Notiz zur Messung (optional)' });

    form.append(
      feld('Zeitpunkt', fZeit),
      feld('Messer/in', fMesser),
      feld('Außentemperatur', el('span', { class: 'temp-zeile' }, fTemp, el('span', {}, '°C'), wetterBtn, fQuelle)),
      feld('Notiz', fNotiz),
    );
    wrap.append(form);

    wrap.append(legende());

    // Eingabe-Raster je Messstelle / Ebene
    for (const stelle of State.messstellen) {
      const karte = el('section', { class: 'stelle-karte' });
      karte.append(el('h3', {}, stelle.name,
        stelle.beschreibung ? el('span', { class: 'klein-grau' }, ' – ' + stelle.beschreibung) : null));

      if (!(stelle.ebenen || []).length) {
        karte.append(el('p', { class: 'klein-grau' }, 'Keine Ebenen – im Reiter „Messstellen" ergänzen.'));
      }
      for (const ebene of (stelle.ebenen || [])) {
        const vorhanden = State.werte[ebene.id] || {};
        const input = el('input', {
          type: 'number', step: '0.1', class: 'temp-feld', placeholder: '°C',
          'data-ebene': ebene.id, value: vorhanden.temperatur ?? '',
        });
        const badge = el('span', { class: 'badge' });
        const aktualisiere = () => {
          const t = input.value === '' ? null : parseFloat(input.value);
          State.werte[ebene.id] = { ...(State.werte[ebene.id] || {}), temperatur: input.value === '' ? null : t };
          const st = stufeFuer(t);
          input.className = 'temp-feld' + (st ? ' s-' + st.klasse : '');
          badge.className = 'badge' + (st ? ' s-' + st.klasse : '');
          badge.textContent = st && t !== null ? st.titel : '';
          badge.title = st ? st.hinweis : '';
        };
        input.addEventListener('input', aktualisiere);

        const zeile = el('div', { class: 'ebene-zeile' },
          el('label', { class: 'ebene-name' }, ebene.bezeichnung),
          input, el('span', {}, '°C'), badge);
        karte.append(zeile);
        aktualisiere();
      }
      wrap.append(karte);
    }

    const aktion = el('div', { class: 'aktionsleiste' });
    aktion.append(
      el('button', { class: 'btn primaer', onclick: speichereMessreihe },
        State.editReiheId ? '✓ Änderungen speichern' : '✓ Messung speichern'),
      el('button', { class: 'btn', onclick: neueMessung }, '✕ Zurücksetzen'),
    );
    wrap.append(aktion);
  }

  function feld(label, ...inhalt) {
    return el('label', { class: 'feld' }, el('span', { class: 'feld-label' }, label), ...inhalt);
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
    renderMessung();
  }

  async function speichereMessreihe() {
    const tempRoh = $('#m-temp').value;
    const quelleEl = $('#m-quelle');
    const auto = (quelleEl.dataset.quelle === 'open-meteo');

    const werte = Object.entries(State.werte)
      .filter(([, v]) => v && v.temperatur !== null && v.temperatur !== undefined && !isNaN(v.temperatur))
      .map(([ebene_id, v]) => ({ ebene_id: Number(ebene_id), temperatur: v.temperatur, notiz: v.notiz || '' }));

    if (!werte.length) {
      meldung('Bitte mindestens einen Temperaturwert eingeben.', 'fehler');
      return;
    }

    const zeitInput = $('#m-zeit').value;
    const daten = {
      id: State.editReiheId || undefined,
      zeitpunkt: zeitInput ? new Date(zeitInput).toISOString() : new Date().toISOString(),
      aussentemperatur: tempRoh === '' ? null : parseFloat(tempRoh),
      temp_quelle: auto ? 'open-meteo' : 'manuell',
      geo_lat: auto ? parseFloat(quelleEl.dataset.lat) : null,
      geo_lon: auto ? parseFloat(quelleEl.dataset.lon) : null,
      wetter_text: auto ? quelleEl.textContent.replace(/^auto · /, '') : '',
      messer: $('#m-messer').value.trim(),
      notiz: $('#m-notiz').value.trim(),
      messwerte: werte,
    };

    try {
      await Api.messreiheSave(daten);
      meldung('Messung gespeichert (' + werte.length + ' Werte).', 'ok');
      neueMessung();
      await ladeDaten();
      renderAlles();
    } catch (e) {
      meldung('Speichern fehlgeschlagen: ' + e.message, 'fehler');
    }
  }

  // ======================================================================
  //  Ansicht 2: Messstellen (Stammdaten)
  // ======================================================================
  function renderMessstellen() {
    const wrap = $('#view-messstellen');
    wrap.innerHTML = '';

    const neu = el('div', { class: 'stelle-neu' });
    const inName = el('input', { type: 'text', placeholder: 'Neue Messstelle (z. B. Scheune Nord)' });
    const inBesch = el('input', { type: 'text', placeholder: 'Beschreibung (optional)' });
    neu.append(inName, inBesch, el('button', {
      class: 'btn primaer',
      onclick: async () => {
        if (!inName.value.trim()) { meldung('Name fehlt.', 'fehler'); return; }
        await aktion(() => Api.messstelleSave({ name: inName.value.trim(), beschreibung: inBesch.value.trim() }));
      },
    }, '+ Messstelle'));
    wrap.append(el('h2', {}, 'Messstellen & Ebenen'), neu);

    if (!State.messstellen.length) {
      wrap.append(el('p', { class: 'klein-grau' }, 'Noch keine Messstellen.'));
      return;
    }

    for (const stelle of State.messstellen) {
      const karte = el('section', { class: 'stelle-karte' });
      const titel = el('input', { type: 'text', class: 'inline-edit', value: stelle.name });
      const besch = el('input', { type: 'text', class: 'inline-edit klein', value: stelle.beschreibung || '', placeholder: 'Beschreibung' });
      const kopf = el('div', { class: 'stelle-kopf' },
        titel, besch,
        el('button', { class: 'btn klein', onclick: () =>
          aktion(() => Api.messstelleSave({ id: stelle.id, name: titel.value.trim(), beschreibung: besch.value.trim() })) }, 'Speichern'),
        el('button', { class: 'btn klein gefahr', onclick: () => {
          if (confirm('Messstelle „' + stelle.name + '" inkl. Ebenen und zugehörigen Messwerten löschen?'))
            aktion(() => Api.messstelleDelete(stelle.id));
        } }, 'Löschen'),
      );
      karte.append(kopf);

      const liste = el('div', { class: 'ebenen-liste' });
      for (const ebene of (stelle.ebenen || [])) {
        const inB = el('input', { type: 'text', class: 'inline-edit', value: ebene.bezeichnung });
        liste.append(el('div', { class: 'ebene-edit' },
          inB,
          el('button', { class: 'btn mini', onclick: () =>
            aktion(() => Api.ebeneSave({ id: ebene.id, messstelle_id: stelle.id, bezeichnung: inB.value.trim() })) }, '✓'),
          el('button', { class: 'btn mini gefahr', onclick: () => {
            if (confirm('Ebene „' + ebene.bezeichnung + '" löschen?'))
              aktion(() => Api.ebeneDelete(ebene.id));
          } }, '✕'),
        ));
      }

      // Neue Ebene – mit Schnellbuttons
      const inNeu = el('input', { type: 'text', placeholder: 'Neue Ebene/Bezeichnung' });
      const addEbene = (bez) => aktion(() => Api.ebeneSave({ messstelle_id: stelle.id, bezeichnung: bez }));
      const schnell = el('span', { class: 'schnell' });
      for (const v of ['Oben', 'Mitte', 'Unten']) {
        schnell.append(el('button', { class: 'btn mini', onclick: () => addEbene(v) }, '+ ' + v));
      }
      liste.append(el('div', { class: 'ebene-neu' },
        inNeu,
        el('button', { class: 'btn klein', onclick: () => {
          if (inNeu.value.trim()) addEbene(inNeu.value.trim());
        } }, '+ Ebene'),
        schnell,
      ));
      karte.append(liste);
      wrap.append(karte);
    }
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

      det.append(el('summary', {},
        el('span', { class: 'r-zeit' }, zeitLesbar(r.zeitpunkt)),
        stMax ? el('span', { class: 'badge s-' + stMax.klasse }, 'max ' + max.toFixed(1) + ' °C · ' + stMax.titel) : null,
        el('span', { class: 'klein-grau' },
          (r.aussentemperatur != null ? ' · außen ' + r.aussentemperatur + ' °C' : '')
          + (r.temp_quelle === 'open-meteo' ? ' (auto)' : '')
          + (r.messer ? ' · ' + r.messer : '')),
      ));

      const tab = el('table', { class: 'werte-tab' });
      tab.append(el('tr', {},
        el('th', {}, 'Messstelle'), el('th', {}, 'Ebene'),
        el('th', {}, 'Temperatur'), el('th', {}, 'Bewertung'), el('th', {}, 'Notiz')));
      for (const w of r.messwerte) {
        const info = ebeneById(w.ebene_id);
        const st = stufeFuer(w.temperatur);
        tab.append(el('tr', { class: st ? 's-' + st.klasse : '' },
          el('td', {}, info ? info.stelle.name : '—'),
          el('td', {}, info ? info.ebene.bezeichnung : ('Ebene #' + w.ebene_id)),
          el('td', { class: 'num' }, w.temperatur != null ? w.temperatur.toFixed(1) + ' °C' : '—'),
          el('td', {}, st ? st.titel : ''),
          el('td', {}, w.notiz || '')));
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
      State.werte[w.ebene_id] = { temperatur: w.temperatur, notiz: w.notiz || '' };
    }
    zeigeView('messung');
    renderMessung();
    // Kopf-Felder nachfüllen
    $('#m-zeit').value = lokaleZeit(new Date(r.zeitpunkt));
    $('#m-messer').value = r.messer || '';
    $('#m-notiz').value = r.notiz || '';
    if (r.aussentemperatur != null) $('#m-temp').value = r.aussentemperatur;
    const q = $('#m-quelle');
    if (r.temp_quelle === 'open-meteo') {
      q.textContent = 'auto · ' + (r.wetter_text || '');
      q.dataset.quelle = 'open-meteo';
      q.dataset.lat = r.geo_lat; q.dataset.lon = r.geo_lon;
    }
    meldung('Messung wird bearbeitet.', 'info');
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
      // Server nicht erreichbar – trotzdem Login zeigen mit Hinweis.
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

    // Vor dem Drucken alle Verlaufs-Einträge aufklappen.
    window.addEventListener('beforeprint', () => $$('#view-verlauf details').forEach((d) => (d.open = true)));

    await pruefeAnmeldung();
  }

  return { init, _STUFEN: STUFEN, stufeFuer };
})();

document.addEventListener('DOMContentLoaded', App.init);
