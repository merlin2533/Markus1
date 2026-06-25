/* =============================================================
   Offside · zentraler Zustand (State)
   Hält alle Daten, kümmert sich um Persistenz im localStorage
   und benachrichtigt Listener bei Änderungen.
   ============================================================= */

const STORAGE_KEY = 'offside.kommunikationsplan.v1';

const State = (() => {
  let data = null;
  let selectedId = null;          // aktuell ausgewähltes Element
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = JSON.parse(raw);
        // Defensive Defaults für ältere Stände
        data.elemente     = data.elemente     || [];
        data.verbindungen = data.verbindungen || [];
        data.teilnehmer   = data.teilnehmer   || [];
        data.hierarchie   = data.hierarchie   || [];
        data.meta         = data.meta         || {};
        return;
      }
    } catch (e) {
      console.warn('Konnte gespeicherten Stand nicht laden:', e);
    }
    data = demoDaten();
    persist();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Speichern fehlgeschlagen:', e);
    }
  }

  function notify() {
    persist();
    listeners.forEach(fn => fn(data));
  }

  /* ---- öffentliche API ---- */
  return {
    init() { load(); },
    get()  { return data; },
    onChange(fn) { listeners.push(fn); },
    touch() { notify(); },

    /* Auswahl */
    select(id) { selectedId = id; listeners.forEach(fn => fn(data)); },
    selectedId() { return selectedId; },
    selected() { return data.elemente.find(e => e.id === selectedId) || null; },

    /* Daten ersetzen (Import / Reset) */
    replace(newData) {
      data = newData;
      selectedId = null;
      notify();
    },
    reset() {
      data = demoDaten();
      selectedId = null;
      notify();
    },

    /* ---- Elemente ---- */
    addElement(el) {
      el.id = el.id || nextId('E', data.elemente);
      data.elemente.push(el);
      selectedId = el.id;
      notify();
      return el;
    },
    updateElement(id, patch) {
      const el = data.elemente.find(e => e.id === id);
      if (el) { Object.assign(el, patch); notify(); }
    },
    moveElement(id, x, y) {
      const el = data.elemente.find(e => e.id === id);
      if (el) { el.x = x; el.y = y; persist(); }   // ohne Re-Render-Sturm
    },
    deleteElement(id) {
      data.elemente = data.elemente.filter(e => e.id !== id);
      data.verbindungen = data.verbindungen.filter(v => v.von !== id && v.bis !== id);
      if (selectedId === id) selectedId = null;
      notify();
    },

    /* ---- Verbindungen ---- */
    addVerbindung(von, bis, label) {
      if (von === bis) return;
      const exists = data.verbindungen.some(v => v.von === von && v.bis === bis);
      if (exists) return;
      data.verbindungen.push({ id: nextId('V', data.verbindungen), von, bis, label: label || '' });
      notify();
    },
    deleteVerbindung(id) {
      data.verbindungen = data.verbindungen.filter(v => v.id !== id);
      notify();
    },

    /* ---- Teilnehmer ---- */
    addTeilnehmer(t) {
      t.id = t.id || nextId('P', data.teilnehmer);
      data.teilnehmer.push(t);
      notify();
    },
    updateTeilnehmer(id, patch) {
      const t = data.teilnehmer.find(x => x.id === id);
      if (t) { Object.assign(t, patch); notify(); }
    },
    deleteTeilnehmer(id) {
      data.teilnehmer = data.teilnehmer.filter(x => x.id !== id);
      notify();
    },

    /* ---- Hierarchie ---- */
    addHierarchie(h) {
      h.id = h.id || nextId('H', data.hierarchie);
      data.hierarchie.push(h);
      data.hierarchie.sort((a, b) => (a.rang || 99) - (b.rang || 99));
      notify();
    },
    updateHierarchie(id, patch) {
      const h = data.hierarchie.find(x => x.id === id);
      if (h) { Object.assign(h, patch); data.hierarchie.sort((a, b) => (a.rang || 99) - (b.rang || 99)); notify(); }
    },
    deleteHierarchie(id) {
      data.hierarchie = data.hierarchie.filter(x => x.id !== id);
      notify();
    },

    /* ---- Meta ---- */
    updateMeta(patch) { Object.assign(data.meta, patch); notify(); }
  };

  function nextId(prefix, arr) {
    let n = 1;
    const ids = new Set(arr.map(o => o.id));
    while (ids.has(prefix + String(n).padStart(2, '0'))) n++;
    return prefix + String(n).padStart(2, '0');
  }
})();
