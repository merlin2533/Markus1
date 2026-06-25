/* =============================================================
   Offside · zentraler Zustand (State)
   Verwaltet MEHRERE Pläne, Persistenz im localStorage,
   referenzielle Integrität, Undo/Redo-History und benachrichtigt
   Listener bei Änderungen.

   Speicher-Schema (v2):
   { version:2, aktivId, plaene: { <id>: PLAN } }
   PLAN = { id, name, meta, elemente, verbindungen, teilnehmer, hierarchie }
   ============================================================= */

const STORAGE_KEY = 'offside.kommunikationsplan.v1'; // Key bleibt (enthält jetzt v2-Struktur)
const HISTORY_MAX = 50;

const State = (() => {
  let store = null;          // { version, aktivId, plaene }
  let selectedId = null;     // ausgewähltes Element (im aktiven Plan)
  const listeners = [];

  // Undo/Redo-Stacks je aktivem Plan (Snapshots des Plan-Objekts)
  let undoStack = [];
  let redoStack = [];

  /* ------------------------------------------------------------ Laden */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        store = migrate(parsed);
        ensureValid();
        return;
      }
    } catch (e) {
      console.warn('Konnte gespeicherten Stand nicht laden:', e);
    }
    store = freshStore();
    persist();
  }

  function migrate(parsed) {
    // v2 bereits vorhanden?
    if (parsed && parsed.version === 2 && parsed.plaene) return parsed;
    // v1: Einzelplan {meta,elemente,...} -> in plaene überführen
    const plan = normalizePlan(parsed, 'PL01', parsed && parsed.meta && parsed.meta.titel || 'Kommunikationsplan');
    return { version: 2, aktivId: plan.id, plaene: { [plan.id]: plan } };
  }

  function freshStore() {
    const demo = normalizePlan(demoDaten(), 'PL01', 'Kommunikationsplan – DEMO');
    return { version: 2, aktivId: demo.id, plaene: { [demo.id]: demo } };
  }

  function normalizePlan(p, id, name) {
    p = p || {};
    return {
      id: p.id || id,
      name: p.name || name,
      meta: p.meta || {},
      elemente: p.elemente || [],
      verbindungen: p.verbindungen || [],
      teilnehmer: p.teilnehmer || [],
      hierarchie: p.hierarchie || []
    };
  }

  function ensureValid() {
    if (!store.plaene || !Object.keys(store.plaene).length) {
      store = freshStore();
    }
    if (!store.plaene[store.aktivId]) {
      store.aktivId = Object.keys(store.plaene)[0];
    }
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (e) { console.warn('Speichern fehlgeschlagen:', e); }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function plan() { return store.plaene[store.aktivId]; }

  /* ------------------------------------------------------------ Notify */
  function notify() {
    persist();
    listeners.forEach(fn => fn(plan()));
  }
  // wie notify, legt aber vorher einen Undo-Schnappschuss an
  function commit() {
    pushHistory();
    notify();
  }

  /* ------------------------------------------------------------ History */
  function pushHistory() {
    undoStack.push(clone(plan()));
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack = [];
  }
  function resetHistory() { undoStack = []; redoStack = []; }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(clone(plan()));
    store.plaene[store.aktivId] = undoStack.pop();
    selectedId = null;
    notify();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(clone(plan()));
    store.plaene[store.aktivId] = redoStack.pop();
    selectedId = null;
    notify();
  }

  /* ------------------------------------------------------------ ID-Helfer */
  function nextId(prefix, arr) {
    let n = 1;
    const ids = new Set(arr.map(o => o.id));
    while (ids.has(prefix + String(n).padStart(2, '0'))) n++;
    return prefix + String(n).padStart(2, '0');
  }
  function nextPlanId() {
    let n = 1;
    while (store.plaene['PL' + String(n).padStart(2, '0')]) n++;
    return 'PL' + String(n).padStart(2, '0');
  }

  /* ------------------------------------------------------------ Integrität */
  // Beim Umbenennen/Löschen von Teilnehmern oder Hierarchien Verweise pflegen.
  function kaskadiereTeilnehmer(altName, neuName) {
    plan().elemente.forEach(e => {
      if (e.zuordnung === altName) e.zuordnung = neuName; // neuName='' => Verweis leeren
      if (Array.isArray(e.teilnehmer)) {
        e.teilnehmer = e.teilnehmer
          .map(n => (n === altName ? neuName : n))
          .filter(n => n !== '');
      }
    });
  }
  function kaskadiereHierarchie(altEbene, neuEbene) {
    plan().elemente.forEach(e => { if (e.hierarchie === altEbene) e.hierarchie = neuEbene; });
    plan().teilnehmer.forEach(t => { if (t.hierarchie === altEbene) t.hierarchie = neuEbene; });
  }

  /* ============================================================ API */
  return {
    init() { load(); },
    get() { return plan(); },                 // aktiver Plan
    onChange(fn) { listeners.push(fn); },
    touch() { notify(); },

    /* Auswahl */
    select(id) { selectedId = id; listeners.forEach(fn => fn(plan())); },
    selectedId() { return selectedId; },
    selected() { return plan().elemente.find(e => e.id === selectedId) || null; },

    /* ---- Pläne ---- */
    listPlaene() { return Object.values(store.plaene).map(p => ({ id: p.id, name: p.name })); },
    aktivId() { return store.aktivId; },
    switchPlan(id) {
      if (!store.plaene[id]) return;
      store.aktivId = id;
      selectedId = null;
      resetHistory();
      notify();
    },
    createPlan(name) {
      const id = nextPlanId();
      store.plaene[id] = normalizePlan({
        meta: { titel: name || 'Neuer Plan', behoerde: '', stand: '', ersteller: '' }
      }, id, name || 'Neuer Plan');
      store.aktivId = id;
      selectedId = null;
      resetHistory();
      notify();
      return id;
    },
    duplicatePlan(id) {
      const src = store.plaene[id || store.aktivId];
      if (!src) return;
      const nid = nextPlanId();
      const copy = clone(src);
      copy.id = nid;
      copy.name = src.name + ' (Kopie)';
      store.plaene[nid] = copy;
      store.aktivId = nid;
      selectedId = null;
      resetHistory();
      notify();
      return nid;
    },
    renamePlan(id, name) {
      const p = store.plaene[id || store.aktivId];
      if (p && name) { p.name = name; notify(); }
    },
    deletePlan(id) {
      id = id || store.aktivId;
      if (Object.keys(store.plaene).length <= 1) return false; // mind. 1 Plan
      delete store.plaene[id];
      if (store.aktivId === id) store.aktivId = Object.keys(store.plaene)[0];
      selectedId = null;
      resetHistory();
      notify();
      return true;
    },
    // ganzen Plan importieren (als neuen Plan oder aktiven ersetzen)
    importPlan(planData, alsNeu, name) {
      if (alsNeu) {
        const id = nextPlanId();
        const p = normalizePlan(planData, id, name || (planData.meta && planData.meta.titel) || 'Importiert');
        store.plaene[id] = p;
        store.aktivId = id;
      } else {
        const cur = plan();
        Object.assign(cur, normalizePlan(planData, cur.id, name || cur.name));
        cur.id = store.aktivId;
      }
      selectedId = null;
      resetHistory();
      notify();
    },
    resetAktiv() {
      const id = store.aktivId;
      store.plaene[id] = normalizePlan(demoDaten(), id, 'Kommunikationsplan – DEMO');
      selectedId = null;
      resetHistory();
      notify();
    },

    /* ---- Gesamt-Backup (ALLE Pläne) ---- */
    exportWorkspace() { return clone(store); },
    importWorkspace(obj) {
      const migrated = migrate(obj);
      if (!migrated || !migrated.plaene || !Object.keys(migrated.plaene).length) {
        throw new Error('Datei enthält keine gültigen Pläne.');
      }
      store = migrated;
      ensureValid();
      selectedId = null;
      resetHistory();
      notify();
    },

    /* ---- Undo/Redo ---- */
    undo, redo,
    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },

    /* ---- Elemente ---- */
    addElement(el) {
      pushHistory();
      el.id = el.id || nextId('E', plan().elemente);
      plan().elemente.push(el);
      selectedId = el.id;
      notify();
      return el;
    },
    updateElement(id, patch) {
      const el = plan().elemente.find(e => e.id === id);
      if (el) { pushHistory(); Object.assign(el, patch); notify(); }
    },
    duplicateElement(id) {
      const el = plan().elemente.find(e => e.id === id);
      if (!el) return;
      pushHistory();
      const copy = clone(el);
      copy.id = nextId('E', plan().elemente);
      copy.titel = el.titel + ' (Kopie)';
      copy.x = (el.x || 0) + 30; copy.y = (el.y || 0) + 30;
      plan().elemente.push(copy);
      selectedId = copy.id;
      notify();
      return copy.id;
    },
    moveElement(id, x, y) {
      const el = plan().elemente.find(e => e.id === id);
      if (el) { pushHistory(); el.x = x; el.y = y; notify(); }
    },
    // viele Positionen auf einmal (Auto-Layout) – ein History-Eintrag
    setPositions(map) {
      pushHistory();
      plan().elemente.forEach(e => { if (map[e.id]) { e.x = map[e.id].x; e.y = map[e.id].y; } });
      notify();
    },
    deleteElement(id) {
      pushHistory();
      const p = plan();
      p.elemente = p.elemente.filter(e => e.id !== id);
      p.verbindungen = p.verbindungen.filter(v => v.von !== id && v.bis !== id);
      if (selectedId === id) selectedId = null;
      notify();
    },

    /* ---- Verbindungen ---- */
    addVerbindung(von, bis, label) {
      if (von === bis) return;
      const p = plan();
      if (p.verbindungen.some(v => v.von === von && v.bis === bis)) return;
      pushHistory();
      p.verbindungen.push({ id: nextId('V', p.verbindungen), von, bis, label: label || '' });
      notify();
    },
    updateVerbindung(id, patch) {
      const v = plan().verbindungen.find(x => x.id === id);
      if (v) { pushHistory(); Object.assign(v, patch); notify(); }
    },
    deleteVerbindung(id) {
      pushHistory();
      plan().verbindungen = plan().verbindungen.filter(v => v.id !== id);
      notify();
    },

    /* ---- Teilnehmer ---- */
    addTeilnehmer(t) {
      pushHistory();
      t.id = t.id || nextId('P', plan().teilnehmer);
      plan().teilnehmer.push(t);
      notify();
    },
    updateTeilnehmer(id, patch) {
      const t = plan().teilnehmer.find(x => x.id === id);
      if (!t) return;
      pushHistory();
      const altName = t.name;
      Object.assign(t, patch);
      if (patch.name && patch.name !== altName) kaskadiereTeilnehmer(altName, patch.name);
      notify();
    },
    deleteTeilnehmer(id) {
      const t = plan().teilnehmer.find(x => x.id === id);
      if (!t) return;
      pushHistory();
      kaskadiereTeilnehmer(t.name, ''); // tote Verweise entfernen
      plan().teilnehmer = plan().teilnehmer.filter(x => x.id !== id);
      notify();
    },

    /* ---- Hierarchie ---- */
    addHierarchie(h) {
      pushHistory();
      h.id = h.id || nextId('H', plan().hierarchie);
      plan().hierarchie.push(h);
      plan().hierarchie.sort((a, b) => (a.rang || 99) - (b.rang || 99));
      notify();
    },
    updateHierarchie(id, patch) {
      const h = plan().hierarchie.find(x => x.id === id);
      if (!h) return;
      pushHistory();
      const altEbene = h.ebene;
      Object.assign(h, patch);
      if (patch.ebene && patch.ebene !== altEbene) kaskadiereHierarchie(altEbene, patch.ebene);
      plan().hierarchie.sort((a, b) => (a.rang || 99) - (b.rang || 99));
      notify();
    },
    deleteHierarchie(id) {
      const h = plan().hierarchie.find(x => x.id === id);
      if (!h) return;
      pushHistory();
      kaskadiereHierarchie(h.ebene, '');
      plan().hierarchie = plan().hierarchie.filter(x => x.id !== id);
      notify();
    },

    /* ---- Meta ---- */
    updateMeta(patch) { pushHistory(); Object.assign(plan().meta, patch); notify(); }
  };
})();
