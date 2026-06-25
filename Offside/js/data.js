/* =============================================================
   Offside · Kommunikationsplan
   Stammdaten, Aktionsarten und DEMO-Daten (Behörde)
   ============================================================= */

/* ----------------------------------------------------------------
   AKTIONSARTEN
   Welche Kommunikations-Aktionen sind in einer Behörde notwendig?
   Jede Aktionsart hat eine Farbe, ein Kürzel und eine Beschreibung.
   ---------------------------------------------------------------- */
const AKTIONSARTEN = {
  informieren: {
    key: 'informieren',
    label: 'Informieren',
    kuerzel: 'INFO',
    farbe: '#1e5aa8',
    beschreibung: 'Einseitige Weitergabe von Informationen, z. B. Lagebild, Bekanntmachung. Keine Rückmeldung erforderlich.'
  },
  abstimmen: {
    key: 'abstimmen',
    label: 'Abstimmen',
    kuerzel: 'ABST',
    farbe: '#2f8fd6',
    beschreibung: 'Gemeinsame Erarbeitung / Konsensfindung zwischen mehreren Stellen. Ergebnis wird gemeinsam getragen.'
  },
  berichten: {
    key: 'berichten',
    label: 'Berichten',
    kuerzel: 'BER',
    farbe: '#0f3d73',
    beschreibung: 'Strukturierte Rückmeldung an eine übergeordnete Stelle (z. B. Wochenbericht, Sachstand).'
  },
  eskalieren: {
    key: 'eskalieren',
    label: 'Eskalieren',
    kuerzel: 'ESK',
    farbe: '#c0392b',
    beschreibung: 'Hochstufung eines Sachverhalts an die nächsthöhere Ebene bei Risiken, Konflikten oder Fristüberschreitung.'
  },
  beauftragen: {
    key: 'beauftragen',
    label: 'Beauftragen',
    kuerzel: 'AUFT',
    farbe: '#6c3fa3',
    beschreibung: 'Verbindliche Weisung / Auftragserteilung mit klarer Zuständigkeit und Termin.'
  },
  freigeben: {
    key: 'freigeben',
    label: 'Freigeben',
    kuerzel: 'FREI',
    farbe: '#1e8a5a',
    beschreibung: 'Formale Genehmigung / Freigabeentscheidung durch eine berechtigte Stelle.'
  },
  beraten: {
    key: 'beraten',
    label: 'Beraten',
    kuerzel: 'BERAT',
    farbe: '#d98c1f',
    beschreibung: 'Fachliche Empfehlung ohne Entscheidungsbefugnis (z. B. Rechts-, Datenschutz-, Pressehinweis).'
  },
  konsultieren: {
    key: 'konsultieren',
    label: 'Konsultieren',
    kuerzel: 'KONS',
    farbe: '#5a7184',
    beschreibung: 'Aktives Einholen einer Stellungnahme vor einer Entscheidung (Anhörung, Rücksprache).'
  }
};

/* ----------------------------------------------------------------
   HIERARCHIE-EBENEN (pflegbar)
   Jeder Ebene ist ein Rang (1 = oben) zugeordnet – steuert die
   Sortierung und die Eskalationsrichtung.
   ---------------------------------------------------------------- */
const DEMO_HIERARCHIE = [
  { id: 'H1', ebene: 'Behördenleitung',     rang: 1, kurz: 'BL'  },
  { id: 'H2', ebene: 'Abteilungsleitung',   rang: 2, kurz: 'AL'  },
  { id: 'H3', ebene: 'Sachgebietsleitung',  rang: 3, kurz: 'SGL' },
  { id: 'H4', ebene: 'Dienstgruppenleitung',rang: 4, kurz: 'DGL' },
  { id: 'H5', ebene: 'Sachbearbeitung',     rang: 5, kurz: 'SB'  }
];

/* ----------------------------------------------------------------
   TEILNEHMER / THEMENGEBIETE (pflegbar)
   typ: 'person'  -> konkrete Person
        'thema'   -> Organisationseinheit / Themengebiet
   ---------------------------------------------------------------- */
const DEMO_TEILNEHMER = [
  { id: 'P01', typ: 'person', name: 'Dr. Behrendt, Präsidentin',  einheit: 'Behördenleitung',          hierarchie: 'Behördenleitung',      kontakt: 'leitung@ppm.demo' },
  { id: 'P02', typ: 'person', name: 'Vizepräsident Kortmann',     einheit: 'Behördenleitung',          hierarchie: 'Behördenleitung',      kontakt: 'vize@ppm.demo' },
  { id: 'P03', typ: 'person', name: 'LtdPD Maier',                einheit: 'Abteilung Einsatz',        hierarchie: 'Abteilungsleitung',    kontakt: 'einsatz.al@ppm.demo' },
  { id: 'P04', typ: 'person', name: 'EPHK Sander',                einheit: 'Abteilung Kriminalität',   hierarchie: 'Abteilungsleitung',    kontakt: 'k.al@ppm.demo' },
  { id: 'P05', typ: 'person', name: 'PHK Yilmaz',                 einheit: 'SG Einsatzplanung',        hierarchie: 'Sachgebietsleitung',   kontakt: 'sg21@ppm.demo' },
  { id: 'P06', typ: 'person', name: 'KHK Roth',                   einheit: 'SG Ermittlungen',          hierarchie: 'Sachgebietsleitung',   kontakt: 'sg31@ppm.demo' },
  { id: 'P07', typ: 'person', name: 'PHM Weber',                  einheit: 'Lagezentrum',              hierarchie: 'Dienstgruppenleitung', kontakt: 'lz@ppm.demo' },
  { id: 'T01', typ: 'thema',  name: 'Öffentlichkeitsarbeit',      einheit: 'Pressestelle',             hierarchie: 'Sachgebietsleitung',   kontakt: 'presse@ppm.demo' },
  { id: 'T02', typ: 'thema',  name: 'Lage & Einsatz',            einheit: 'Lagezentrum',              hierarchie: 'Dienstgruppenleitung', kontakt: 'lage@ppm.demo' },
  { id: 'T03', typ: 'thema',  name: 'Recht & Datenschutz',        einheit: 'Justiziariat',             hierarchie: 'Sachgebietsleitung',   kontakt: 'recht@ppm.demo' },
  { id: 'T04', typ: 'thema',  name: 'IT & Digitalfunk',           einheit: 'SG Informationstechnik',   hierarchie: 'Sachgebietsleitung',   kontakt: 'it@ppm.demo' },
  { id: 'T05', typ: 'thema',  name: 'Krisenstab',                 einheit: 'Stab',                     hierarchie: 'Behördenleitung',      kontakt: 'stab@ppm.demo' }
];

/* ----------------------------------------------------------------
   KOMMUNIKATIONS-ELEMENTE (Knoten im Chart)
   Jedes Element = eine wiederkehrende oder anlassbezogene
   Kommunikations-Maßnahme.
   ---------------------------------------------------------------- */
const DEMO_ELEMENTE = [
  {
    id: 'E01', titel: 'Tägliche Lagebesprechung', aktion: 'informieren',
    zuordnungTyp: 'thema', zuordnung: 'Lage & Einsatz',
    hierarchie: 'Behördenleitung', frequenz: 'Täglich', kanal: 'Besprechung',
    teilnehmer: ['Dr. Behrendt, Präsidentin', 'LtdPD Maier', 'PHM Weber'],
    notiz: 'Kurzes Morgenbriefing zur aktuellen Lage (08:00 Uhr).',
    x: 120, y: 80
  },
  {
    id: 'E02', titel: 'Einsatzauftrag an Dienstgruppen', aktion: 'beauftragen',
    zuordnungTyp: 'person', zuordnung: 'LtdPD Maier',
    hierarchie: 'Abteilungsleitung', frequenz: 'Anlassbezogen', kanal: 'Funk / DISPO',
    teilnehmer: ['PHK Yilmaz', 'PHM Weber'],
    notiz: 'Verbindliche Auftragserteilung mit Lageabschnitt und Zeitvorgabe.',
    x: 460, y: 80
  },
  {
    id: 'E03', titel: 'Pressemitteilung freigeben', aktion: 'freigeben',
    zuordnungTyp: 'thema', zuordnung: 'Öffentlichkeitsarbeit',
    hierarchie: 'Behördenleitung', frequenz: 'Anlassbezogen', kanal: 'E-Mail',
    teilnehmer: ['Dr. Behrendt, Präsidentin', 'Recht & Datenschutz'],
    notiz: 'Vier-Augen-Prinzip: fachliche und rechtliche Prüfung vor Veröffentlichung.',
    x: 800, y: 80
  },
  {
    id: 'E04', titel: 'Rechtsberatung Maßnahme', aktion: 'beraten',
    zuordnungTyp: 'thema', zuordnung: 'Recht & Datenschutz',
    hierarchie: 'Sachgebietsleitung', frequenz: 'Anlassbezogen', kanal: 'Vermerk',
    teilnehmer: ['EPHK Sander'],
    notiz: 'Fachliche Empfehlung zur Rechtmäßigkeit geplanter Maßnahmen.',
    x: 800, y: 280
  },
  {
    id: 'E05', titel: 'Sachstand Ermittlungen', aktion: 'berichten',
    zuordnungTyp: 'person', zuordnung: 'KHK Roth',
    hierarchie: 'Sachgebietsleitung', frequenz: 'Wöchentlich', kanal: 'Bericht',
    teilnehmer: ['EPHK Sander'],
    notiz: 'Strukturierte Rückmeldung zum Stand laufender Verfahren.',
    x: 460, y: 280
  },
  {
    id: 'E06', titel: 'Wochenbericht an Leitung', aktion: 'berichten',
    zuordnungTyp: 'person', zuordnung: 'EPHK Sander',
    hierarchie: 'Abteilungsleitung', frequenz: 'Wöchentlich', kanal: 'Bericht',
    teilnehmer: ['Dr. Behrendt, Präsidentin', 'Vizepräsident Kortmann'],
    notiz: 'Verdichteter Bericht aller Abteilungen, freitags 12:00 Uhr.',
    x: 120, y: 280
  },
  {
    id: 'E07', titel: 'Eskalation Besondere Lage', aktion: 'eskalieren',
    zuordnungTyp: 'person', zuordnung: 'PHM Weber',
    hierarchie: 'Dienstgruppenleitung', frequenz: 'Anlassbezogen', kanal: 'Telefon',
    teilnehmer: ['LtdPD Maier', 'Krisenstab'],
    notiz: 'Sofortige Hochstufung an Leitung bei Schwelle „Besondere Aufbauorganisation".',
    x: 120, y: 480
  },
  {
    id: 'E08', titel: 'Krisenstab einberufen', aktion: 'abstimmen',
    zuordnungTyp: 'thema', zuordnung: 'Krisenstab',
    hierarchie: 'Behördenleitung', frequenz: 'Anlassbezogen', kanal: 'Besprechung',
    teilnehmer: ['Dr. Behrendt, Präsidentin', 'LtdPD Maier', 'EPHK Sander', 'Öffentlichkeitsarbeit'],
    notiz: 'Gemeinsame Lagebewertung und Maßnahmenabstimmung der BAO.',
    x: 460, y: 480
  },
  {
    id: 'E09', titel: 'IT-Störung melden', aktion: 'konsultieren',
    zuordnungTyp: 'thema', zuordnung: 'IT & Digitalfunk',
    hierarchie: 'Sachgebietsleitung', frequenz: 'Anlassbezogen', kanal: 'Ticketsystem',
    teilnehmer: ['PHK Yilmaz'],
    notiz: 'Rücksprache zur Auswirkung einer Störung auf den Einsatzbetrieb.',
    x: 800, y: 480
  }
];

/* Verbindungen (Kanten) zwischen Elementen: from -> to */
const DEMO_VERBINDUNGEN = [
  { id: 'V01', von: 'E01', bis: 'E02', label: 'Auftrag' },
  { id: 'V02', von: 'E02', bis: 'E05', label: 'Rückmeldung' },
  { id: 'V03', von: 'E05', bis: 'E06', label: 'Verdichtung' },
  { id: 'V04', von: 'E06', bis: 'E03', label: 'Kommunikation' },
  { id: 'V05', von: 'E03', bis: 'E04', label: 'Prüfung' },
  { id: 'V06', von: 'E07', bis: 'E08', label: 'Eskalation' },
  { id: 'V07', von: 'E08', bis: 'E02', label: 'Weisung' },
  { id: 'V08', von: 'E09', bis: 'E08', label: 'Lagebild' }
];

const DEMO_META = {
  titel: 'Kommunikationsplan – Polizeipräsidium (DEMO)',
  behoerde: 'Polizeipräsidium München (fiktiv / DEMO)',
  stand: '2026-06-25',
  ersteller: 'Stab / Organisation'
};

/* Frei wählbare Vorschlagslisten für Dropdowns */
const FREQUENZEN = ['Täglich', 'Wöchentlich', '14-tägig', 'Monatlich', 'Quartalsweise', 'Anlassbezogen'];

/* ----------------------------------------------------------------
   MEDIEN / KANÄLE (über welches Medium wird kommuniziert?)
   Jedes Medium hat ein Icon und eine Farbe für die Darstellung
   im Chart (Canvas-Karten).
   ---------------------------------------------------------------- */
const MEDIEN = {
  'Besprechung': { icon: '🗣️', farbe: '#1e5aa8' },
  'Chat':        { icon: '💬', farbe: '#2f8fd6' },
  'E-Mail':      { icon: '✉️', farbe: '#0f3d73' },
  'Akte':        { icon: '📁', farbe: '#6c3fa3' },
  'Bericht':     { icon: '📄', farbe: '#1e8a5a' },
  'Vermerk':     { icon: '📝', farbe: '#d98c1f' },
  'Telefon':     { icon: '📞', farbe: '#5a7184' },
  'Funk / DISPO':{ icon: '📻', farbe: '#c0392b' },
  'Ticketsystem':{ icon: '🎫', farbe: '#3a4a5e' },
  'Videokonferenz': { icon: '🎥', farbe: '#2f8fd6' },
  'Intranet':    { icon: '🌐', farbe: '#1e5aa8' },
  'Pressemeldung': { icon: '📢', farbe: '#c0392b' }
};
const KANAELE = Object.keys(MEDIEN);

function medium(name) { return MEDIEN[name] || { icon: '🔗', farbe: '#5a7184' }; }

/* ----------------------------------------------------------------
   STATUS pro Element (Bearbeitungsstand der Kommunikation)
   ---------------------------------------------------------------- */
const STATUS = {
  'offen':     { label: 'Offen',     farbe: '#9aa7b8' },
  'inArbeit':  { label: 'In Arbeit', farbe: '#d98c1f' },
  'erledigt':  { label: 'Erledigt',  farbe: '#1e8a5a' },
  'kritisch':  { label: 'Kritisch',  farbe: '#c0392b' }
};
function statusInfo(key) { return STATUS[key] || STATUS['offen']; }

/* DEMO-Stände/Termine den Beispiel-Elementen zuordnen */
const DEMO_STATUS = {
  E01: { status: 'erledigt', termin: '2026-06-25' },
  E02: { status: 'inArbeit', termin: '2026-06-26' },
  E03: { status: 'offen',    termin: '2026-06-28' },
  E04: { status: 'offen',    termin: '2026-06-29' },
  E05: { status: 'inArbeit', termin: '2026-06-27' },
  E06: { status: 'offen',    termin: '2026-06-30' },
  E07: { status: 'kritisch', termin: '2026-06-25' },
  E08: { status: 'inArbeit', termin: '2026-06-26' },
  E09: { status: 'offen',    termin: '2026-07-01' }
};

function demoDaten() {
  const elemente = JSON.parse(JSON.stringify(DEMO_ELEMENTE)).map(e => {
    const s = DEMO_STATUS[e.id] || { status: 'offen', termin: '' };
    return Object.assign({ status: s.status, termin: s.termin }, e, s);
  });
  return {
    meta:          JSON.parse(JSON.stringify(DEMO_META)),
    elemente,
    verbindungen:  JSON.parse(JSON.stringify(DEMO_VERBINDUNGEN)),
    teilnehmer:    JSON.parse(JSON.stringify(DEMO_TEILNEHMER)),
    hierarchie:    JSON.parse(JSON.stringify(DEMO_HIERARCHIE))
  };
}

/* Leerer Plan – übernimmt die Hierarchie-Ebenen als sinnvolle Vorlage,
   startet aber ohne Elemente/Verbindungen/Teilnehmer. */
function leererPlan(name) {
  return {
    meta: { titel: name || 'Neuer Plan', behoerde: '', stand: '', ersteller: '' },
    elemente: [],
    verbindungen: [],
    teilnehmer: [],
    hierarchie: JSON.parse(JSON.stringify(DEMO_HIERARCHIE))
  };
}
