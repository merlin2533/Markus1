/**
 * ExcelIO – Export der Messwerte als .xlsx (SheetJS, lokal in vendor/).
 * Eine Zeile je Messwert; optional auf ein Jahr gefiltert.
 */
const ExcelIO = (() => {

  function verfuegbar() {
    return typeof XLSX !== 'undefined';
  }

  function datumLesbar(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso || '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /**
   * @param {Array} messreihen  Messreihen inkl. messwerte
   * @param {Function} ortInfo  (ort_id) => {ort, halle, stelle} | null
   * @param {Function} stufe    (temp) => {titel} | null
   * @param {Function} stelleName (messstelle_id) => string
   * @param {number|null} jahr  nur dieses Jahr exportieren (null = alle)
   */
  function exportiere(messreihen, ortInfo, stufe, stelleName, jahr) {
    if (!verfuegbar()) {
      throw new Error('Excel-Bibliothek nicht geladen.');
    }
    const zeilen = [];
    for (const r of messreihen) {
      const d = new Date(r.zeitpunkt);
      if (jahr && d.getFullYear() !== jahr) continue;
      for (const w of r.messwerte) {
        const info = ortInfo(w.ort_id);
        const st = stufe(w.temperatur);
        zeilen.push({
          'Datum/Zeit':        datumLesbar(r.zeitpunkt),
          'Messstelle':        info ? info.stelle.name : stelleName(r.messstelle_id),
          'Halle':             info ? info.halle.name : '',
          'Ort':               info ? info.ort.bezeichnung : ('#' + w.ort_id),
          'Temperatur °C':     w.temperatur,
          'Bewertung':         st ? st.titel : '',
          'Außentemp. °C':     r.aussentemperatur,
          'Temp.-Quelle':      r.temp_quelle === 'open-meteo' ? 'automatisch' : 'manuell',
          'Erfasser/in':       r.messer || '',
          'Notiz Messung':     r.notiz || '',
          'Notiz Wert':        w.notiz || '',
        });
      }
    }
    if (!zeilen.length) {
      throw new Error('Keine Messwerte für den gewählten Zeitraum.');
    }
    const ws = XLSX.utils.json_to_sheet(zeilen);
    ws['!cols'] = [
      { wch: 17 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Messwerte');
    const name = 'Heustockmessungen' + (jahr ? '_' + jahr : '') + '.xlsx';
    XLSX.writeFile(wb, name);
    return zeilen.length;
  }

  return { exportiere, verfuegbar };
})();
