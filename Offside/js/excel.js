/* =============================================================
   Offside · Excel-Import / -Export (SheetJS)
   Speichert den kompletten Kommunikationsplan als .xlsx mit
   mehreren Tabellenblättern und liest ihn wieder ein.
   Blätter: Elemente · Verbindungen · Teilnehmer · Hierarchie · Meta
   ============================================================= */

const ExcelIO = (() => {

  function exportXlsx() {
    const d = State.get();
    const wb = XLSX.utils.book_new();

    /* --- Elemente --- */
    const elemente = d.elemente.map(e => ({
      ID: e.id,
      Titel: e.titel,
      Aktionsart: (AKTIONSARTEN[e.aktion] || {}).label || e.aktion,
      AktionsartKey: e.aktion,
      ZuordnungTyp: e.zuordnungTyp === 'person' ? 'Person' : 'Themengebiet',
      Zuordnung: e.zuordnung,
      Hierarchie: e.hierarchie,
      Frequenz: e.frequenz,
      Kanal: e.kanal,
      Teilnehmer: (e.teilnehmer || []).join(', '),
      Notiz: e.notiz,
      X: Math.round(e.x), Y: Math.round(e.y)
    }));
    addSheet(wb, 'Elemente', elemente);

    /* --- Verbindungen --- */
    const verb = d.verbindungen.map(v => ({
      ID: v.id, Von: v.von, Bis: v.bis, Label: v.label
    }));
    addSheet(wb, 'Verbindungen', verb);

    /* --- Teilnehmer --- */
    const teil = d.teilnehmer.map(t => ({
      ID: t.id, Typ: t.typ === 'person' ? 'Person' : 'Themengebiet',
      Name: t.name, Einheit: t.einheit, Hierarchie: t.hierarchie, Kontakt: t.kontakt
    }));
    addSheet(wb, 'Teilnehmer', teil);

    /* --- Hierarchie --- */
    const hier = d.hierarchie.map(h => ({
      ID: h.id, Ebene: h.ebene, Rang: h.rang, Kurz: h.kurz
    }));
    addSheet(wb, 'Hierarchie', hier);

    /* --- Meta --- */
    const meta = Object.entries(d.meta || {}).map(([Feld, Wert]) => ({ Feld, Wert }));
    addSheet(wb, 'Meta', meta.length ? meta : [{ Feld: '—', Wert: '—' }]);

    /* --- Legende Aktionsarten --- */
    const legende = Object.values(AKTIONSARTEN).map(a => ({
      Kürzel: a.kuerzel, Aktionsart: a.label, Beschreibung: a.beschreibung
    }));
    addSheet(wb, 'Legende', legende);

    const name = 'Offside_Kommunikationsplan_' + (d.meta.stand || 'DEMO') + '.xlsx';
    XLSX.writeFile(wb, name);
  }

  function addSheet(wb, name, rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = autoWidth(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  function autoWidth(rows) {
    if (!rows.length) return [];
    return Object.keys(rows[0]).map(k => {
      const max = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
      return { wch: Math.min(60, max + 2) };
    });
  }

  function importXlsx(file, onDone) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const data = demoSkeleton();

        const elSheet = sheet(wb, 'Elemente');
        data.elemente = elSheet.map(r => ({
          id: r.ID || undefined,
          titel: r.Titel || 'Ohne Titel',
          aktion: keyFromLabel(r.AktionsartKey || r.Aktionsart),
          zuordnungTyp: /person/i.test(r.ZuordnungTyp) ? 'person' : 'thema',
          zuordnung: r.Zuordnung || '',
          hierarchie: r.Hierarchie || '',
          frequenz: r.Frequenz || '',
          kanal: r.Kanal || '',
          teilnehmer: (r.Teilnehmer || '').split(',').map(s => s.trim()).filter(Boolean),
          notiz: r.Notiz || '',
          x: num(r.X, 100), y: num(r.Y, 100)
        }));

        data.verbindungen = sheet(wb, 'Verbindungen').map(r => ({
          id: r.ID, von: r.Von, bis: r.Bis, label: r.Label || ''
        })).filter(v => v.von && v.bis);

        data.teilnehmer = sheet(wb, 'Teilnehmer').map(r => ({
          id: r.ID, typ: /person/i.test(r.Typ) ? 'person' : 'thema',
          name: r.Name || '', einheit: r.Einheit || '',
          hierarchie: r.Hierarchie || '', kontakt: r.Kontakt || ''
        })).filter(t => t.name);

        data.hierarchie = sheet(wb, 'Hierarchie').map(r => ({
          id: r.ID, ebene: r.Ebene || '', rang: num(r.Rang, 99), kurz: r.Kurz || ''
        })).filter(h => h.ebene);

        const metaRows = sheet(wb, 'Meta');
        data.meta = {};
        metaRows.forEach(r => { if (r.Feld && r.Feld !== '—') data.meta[r.Feld] = r.Wert; });

        if (!data.elemente.length) throw new Error('Keine Elemente im Blatt „Elemente" gefunden.');
        onDone(null, data);
      } catch (err) {
        onDone(err);
      }
    };
    reader.onerror = () => onDone(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsArrayBuffer(file);
  }

  function sheet(wb, name) {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }) : [];
  }
  function keyFromLabel(v) {
    if (!v) return 'informieren';
    if (AKTIONSARTEN[v]) return v;
    const found = Object.values(AKTIONSARTEN).find(a =>
      a.label.toLowerCase() === String(v).toLowerCase() ||
      a.kuerzel.toLowerCase() === String(v).toLowerCase());
    return found ? found.key : 'informieren';
  }
  function num(v, d) { const n = parseFloat(v); return isFinite(n) ? n : d; }
  function demoSkeleton() {
    return { meta: {}, elemente: [], verbindungen: [], teilnehmer: [], hierarchie: [] };
  }

  return { exportXlsx, importXlsx };
})();
