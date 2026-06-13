/*
 * Daten-Generator für das PTLS POL Dashboard (Präsidium Technik).
 *
 * Erzeugt deterministisch (seeded) realistische Demodaten für ~1.200
 * Mitarbeitende und schreibt:
 *   - daten/personal.xlsx, finanzen.xlsx, fuhrpark.xlsx, einsatz.xlsx
 *     (je Sheets: Ziele, Zeitreihe, Fakten)
 *   - js/fallback-data.js  (identische Daten als window.POL_FALLBACK,
 *     damit das Dashboard auch ohne lokalen Server / via file:// läuft)
 *
 * Aufruf:  node tools/generate-data.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const XLSX = require(path.join(__dirname, 'node_modules', 'xlsx'));

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'daten');
const JS_DIR = path.join(ROOT, 'js');

/* ----------------------------------------------------------------- *
 * Deterministischer Zufall (mulberry32) – reproduzierbare Demodaten
 * ----------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260613);
const rand = () => rng();
const jitter = (amp) => 1 + (rand() - 0.5) * 2 * amp;       // 1 ± amp
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (v, d = 0) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };

/* ----------------------------------------------------------------- *
 * Zeitachse: 25 Monate bis zum aktuellen Monat (2026-06)
 * ----------------------------------------------------------------- */
const STAND = { jahr: 2026, monat: 6 };
const N_MONATE = 25;
function buildMonths() {
  const out = [];
  let y = STAND.jahr, m = STAND.monat;
  for (let i = 0; i < N_MONATE; i++) {
    out.unshift({ key: `${y}-${String(m).padStart(2, '0')}`, jahr: y, monat: m, idx: 0 });
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  out.forEach((o, i) => (o.idx = i));
  return out;
}
const MONATE = buildMonths();
const MKEYS = MONATE.map((m) => m.key);

// saisonale & Trend-Helfer (t = 0..1 über den ganzen Zeitraum)
const trend = (idx) => idx / (N_MONATE - 1);
const seasonWinter = (m) => [1.5, 1.45, 1.15, 0.95, 0.85, 0.8, 0.85, 0.9, 1.0, 1.1, 1.35, 1.55][m - 1]; // Krankenstand
const seasonUrlaub = (m) => [1.3, 1.0, 1.0, 1.1, 1.3, 1.6, 2.4, 2.6, 1.4, 1.1, 1.0, 1.6][m - 1];
const WORKDAYS = (m) => [21, 20, 21, 22, 20, 21, 22, 21, 22, 22, 21, 18][m - 1];

/* ----------------------------------------------------------------- *
 * Stammdaten / Dimensionen (Präsidium Technik)
 * ----------------------------------------------------------------- */
const ABTEILUNGEN = [
  { name: 'Abt. IT / Informationstechnik', w: 0.18, beamteAnteil: 0.32, ueber: 1.15 },
  { name: 'Abt. Telekommunikation & Leitstellentechnik', w: 0.10, beamteAnteil: 0.40, ueber: 1.25 },
  { name: 'Abt. Fuhrpark / Kfz', w: 0.14, beamteAnteil: 0.42, ueber: 1.30 },
  { name: 'Abt. Waffen, Gerät & Einsatzmittel', w: 0.09, beamteAnteil: 0.70, ueber: 1.05 },
  { name: 'Abt. Liegenschaften & Bau', w: 0.11, beamteAnteil: 0.30, ueber: 0.95 },
  { name: 'Abt. Logistik / Beschaffung / Lager', w: 0.16, beamteAnteil: 0.38, ueber: 1.20 },
  { name: 'Abt. Service & Bekleidung', w: 0.08, beamteAnteil: 0.28, ueber: 0.85 },
  { name: 'Zentrale Dienste / Stab / Verwaltung', w: 0.14, beamteAnteil: 0.55, ueber: 0.80 },
];
const STATUS = ['Beamte', 'Nicht-Beamte'];
const LAUFBAHN_BEAMTE = [
  { name: 'mittlerer Dienst', w: 0.35 },
  { name: 'gehobener Dienst', w: 0.50 },
  { name: 'höherer Dienst', w: 0.15 },
];
const LAUFBAHN_TARIF = { name: 'Tarif (EG)', w: 1 };
const GESCHLECHT = [
  { name: 'männlich', w: 0.62 },
  { name: 'weiblich', w: 0.37 },
  { name: 'divers', w: 0.01 },
];
const ALTER = [
  { name: '<30', w: 0.12, mid: 26, sick: 0.85, abgang: 0.4 },
  { name: '30–39', w: 0.22, mid: 35, sick: 0.95, abgang: 0.6 },
  { name: '40–49', w: 0.26, mid: 45, sick: 1.05, abgang: 0.7 },
  { name: '50–59', w: 0.28, mid: 55, sick: 1.25, abgang: 1.1 },
  { name: '≥60', w: 0.12, mid: 62, sick: 1.45, abgang: 4.5 },
];
const TOTAL = 1200;

/* Aufbau der statischen Personal-Zellen (gültige Kombinationen) */
function buildCells() {
  const cells = [];
  ABTEILUNGEN.forEach((ab) => {
    STATUS.forEach((st) => {
      const lbs = st === 'Beamte' ? LAUFBAHN_BEAMTE : [LAUFBAHN_TARIF];
      const statusW = st === 'Beamte' ? ab.beamteAnteil : 1 - ab.beamteAnteil;
      lbs.forEach((lb) => {
        GESCHLECHT.forEach((g) => {
          ALTER.forEach((al) => {
            const base = TOTAL * ab.w * statusW * lb.w * g.w * al.w * jitter(0.18);
            if (base < 0.4) return; // winzige Zellen weglassen
            cells.push({
              abteilung: ab.name, abMeta: ab, status: st, laufbahn: lb.name,
              geschlecht: g.name, alter: al.name, alMeta: al, base,
            });
          });
        });
      });
    });
  });
  return cells;
}
const CELLS = buildCells();

/* ----------------------------------------------------------------- *
 * Bereich 1: PERSONAL
 * ----------------------------------------------------------------- */
function buildPersonal() {
  const fakten = [];
  const zeitreihe = [];

  MONATE.forEach((mo) => {
    const wachstum = 1 + 0.02 * trend(mo.idx);            // leichtes Wachstum ~2 %
    let pStand = 0, krank = 0, urlaub = 0, ueber = 0, zu = 0, ab = 0, teilzeit = 0;
    let alterSum = 0, frauen = 0, resturlaubSum = 0;

    CELLS.forEach((c) => {
      const hc = Math.max(0, Math.round(c.base * wachstum * jitter(0.05)));
      if (hc === 0) return;
      const kd = hc * 1.0 * c.alMeta.sick * seasonWinter(mo.monat) * jitter(0.12);
      const ud = hc * 0.62 * seasonUrlaub(mo.monat) * jitter(0.10);
      const ud_total = ud;
      const uh = hc * (4.2 * c.abMeta.ueber) * jitter(0.18);
      const zug = rand() < (hc * 0.004) ? Math.round(hc * 0.01 * jitter(0.5)) : 0;
      const abg = rand() < (hc * 0.004 * c.alMeta.abgang) ? Math.round(1 + rand() * 1.5) : 0;
      const tz = Math.round(hc * (c.geschlecht === 'weiblich' ? 0.34 : 0.09) * jitter(0.2));

      fakten.push({
        Monat: mo.key, Abteilung: c.abteilung, Beamtenstatus: c.status,
        Laufbahngruppe: c.laufbahn, Geschlecht: c.geschlecht, Altersgruppe: c.alter,
        Personalstand: hc, Krankheitstage: round(kd, 1), Urlaubstage: round(ud_total, 1),
        Ueberstunden: round(uh, 0), Zugaenge: zug, Abgaenge: abg, Teilzeit: tz,
      });

      pStand += hc; krank += kd; urlaub += ud_total; ueber += uh;
      zu += zug; ab += abg; teilzeit += tz;
      alterSum += hc * c.alMeta.mid;
      if (c.geschlecht === 'weiblich') frauen += hc;
      // Resturlaub: hoch zu Jahresbeginn (~28), niedrig im Dezember (~3)
      resturlaubSum += hc * (29 - (mo.monat - 1) * 2.3 + rand() * 2);
    });

    const krankenstandquote = (krank / (WORKDAYS(mo.monat) * pStand)) * 100;
    zeitreihe.push({
      Monat: mo.key,
      Personalstand: pStand,
      VZAE: round(pStand - teilzeit * 0.4, 0),
      Krankenstandquote: round(krankenstandquote, 2),
      Krankheitstage: round(krank, 0),
      Urlaubstage: round(urlaub, 0),
      Resturlaub: round(resturlaubSum / pStand, 1),
      Ueberstunden: round(ueber, 0),
      Zugaenge: zu,
      Abgaenge: ab,
      Fluktuationsquote: round((ab / pStand) * 100, 2),
      Durchschnittsalter: round(alterSum / pStand, 1),
      Teilzeitquote: round((teilzeit / pStand) * 100, 1),
      Frauenanteil: round((frauen / pStand) * 100, 1),
    });
  });

  const ziele = [
    z('Personalstand', 1200, 'hoch', 5),
    z('Krankenstandquote', 5.0, 'niedrig', 12),
    z('Krankheitstage', 1300, 'niedrig', 12),
    z('Urlaubstage', 2400, 'neutral', 25),
    z('Resturlaub', 10, 'niedrig', 20),
    z('Ueberstunden', 5200, 'niedrig', 15),
    z('Fluktuationsquote', 0.6, 'niedrig', 25),
    z('Durchschnittsalter', 44, 'niedrig', 6),
    z('Teilzeitquote', 18, 'neutral', 20),
    z('Frauenanteil', 40, 'hoch', 10),
  ];
  return { zeitreihe, fakten, ziele };
}

/* ----------------------------------------------------------------- *
 * Bereich 2: FINANZEN
 * ----------------------------------------------------------------- */
const KOSTENARTEN = ['Personalkosten', 'Sachkosten', 'Überstundenkosten', 'Investitionen'];
function buildFinanzen(personalZR) {
  const fakten = [];
  const zeitreihe = [];
  const JAHRESBUDGET = 98_000_000;
  const budgetMonat = JAHRESBUDGET / 12;
  let ytdIst = 0, ytdSoll = 0, lastJahr = null;

  MONATE.forEach((mo, i) => {
    if (mo.jahr !== lastJahr) { ytdIst = 0; ytdSoll = 0; lastJahr = mo.jahr; }
    const pStand = personalZR[i].Personalstand;
    const ueberStd = personalZR[i].Ueberstunden;

    let personalkosten = 0, sachkosten = 0, ueberkosten = 0, invest = 0;
    ABTEILUNGEN.forEach((ab) => {
      const anteil = ab.w;
      const pk = JAHRESBUDGET * 0.80 / 12 * anteil * jitter(0.04);
      const sk = JAHRESBUDGET * 0.12 / 12 * anteil * jitter(0.12);
      const uk = ueberStd * anteil * 34 * jitter(0.10); // ~34 €/Std
      // Investitionen lumpy: gelegentliche Spitzen
      const spike = rand() < 0.18 ? (1.5 + rand() * 4) : 1;
      const inv = JAHRESBUDGET * 0.08 / 12 * anteil * spike * jitter(0.2);
      personalkosten += pk; sachkosten += sk; ueberkosten += uk; invest += inv;
      [['Personalkosten', pk], ['Sachkosten', sk], ['Überstundenkosten', uk], ['Investitionen', inv]]
        .forEach(([art, betrag]) => fakten.push({
          Monat: mo.key, Abteilung: ab.name, Kostenart: art, Betrag: round(betrag, 0),
        }));
    });
    const gesamt = personalkosten + sachkosten + ueberkosten + invest;
    ytdIst += gesamt; ytdSoll += budgetMonat;

    zeitreihe.push({
      Monat: mo.key,
      Gesamtkosten: round(gesamt, 0),
      Personalkosten: round(personalkosten, 0),
      Sachkosten: round(sachkosten, 0),
      Ueberstundenkosten: round(ueberkosten, 0),
      Investitionen: round(invest, 0),
      BudgetSollMonat: round(budgetMonat, 0),
      BudgetausschoepfungYTD: round((ytdIst / (JAHRESBUDGET * (mo.monat / 12))) * 100, 1),
      KostenProKopf: round(gesamt / pStand, 0),
    });
  });

  const ziele = [
    z('Gesamtkosten', round(budgetMonat, 0), 'niedrig', 6),
    z('Personalkosten', round(JAHRESBUDGET * 0.80 / 12, 0), 'neutral', 6),
    z('Sachkosten', round(JAHRESBUDGET * 0.12 / 12, 0), 'niedrig', 12),
    z('Ueberstundenkosten', 230000, 'niedrig', 15),
    z('Investitionen', round(JAHRESBUDGET * 0.08 / 12, 0), 'neutral', 30),
    z('BudgetausschoepfungYTD', 100, 'neutral', 5),
    z('KostenProKopf', 6800, 'niedrig', 8),
  ];
  return { zeitreihe, fakten, ziele };
}

/* ----------------------------------------------------------------- *
 * Budget nach Referat × Budgetelement (Plan / Ist / Abgerechnet)
 * ----------------------------------------------------------------- */
const REFERATE = [
  { name: 'Referat 1', w: 0.28 },
  { name: 'Referat 2', w: 0.22 },
  { name: 'Referat 3', w: 0.18 },
  { name: 'Referat 4', w: 0.20 },
  { name: 'Stab', w: 0.12 },
];
const BUDGETELEMENTE = [
  { name: 'Personalbudget', w: 0.55, saison: false },
  { name: 'Sachmittel', w: 0.12, saison: true },
  { name: 'IT & Technik', w: 0.10, saison: true },
  { name: 'Fuhrpark & Mobilität', w: 0.08, saison: true },
  { name: 'Liegenschaften', w: 0.07, saison: true },
  { name: 'Fortbildung', w: 0.03, saison: true },
  { name: 'Investitionen', w: 0.05, saison: true },
];
function buildBudget() {
  const JAHRESBUDGET = 98_000_000;
  const rows = [];
  MONATE.forEach((mo) => {
    REFERATE.forEach((rf) => {
      BUDGETELEMENTE.forEach((be) => {
        var planMonat = JAHRESBUDGET * rf.w * be.w / 12;
        // Ist: Personalbudget gleichmäßig, Sachbudgets schwankend; leichte Über-/Unterschreitung
        var saison = be.saison ? (0.7 + 0.6 * (1 + Math.sin((mo.monat - 3) / 1.9)) / 2) : 1;
        var ist = planMonat * saison * jitter(be.saison ? 0.22 : 0.04);
        // Abgerechnet: dem Ist nachlaufend (Rechnungslauf), 82–97 % des Ist
        var abger = ist * (0.82 + rand() * 0.15);
        rows.push({
          Monat: mo.key, Referat: rf.name, Budgetelement: be.name,
          Plan: round(planMonat, 0), Ist: round(ist, 0), Abgerechnet: round(abger, 0),
        });
      });
    });
  });
  return rows;
}

/* ----------------------------------------------------------------- *
 * Bereich 3: FUHRPARK & AUSSTATTUNG
 * ----------------------------------------------------------------- */
const FZ_KLASSEN = [
  { name: 'Funkstreifenwagen', w: 0.34, km: 1800, wk: 320 },
  { name: 'Transporter / Mannschaftswagen', w: 0.22, km: 1500, wk: 380 },
  { name: 'Krad / Motorrad', w: 0.08, km: 700, wk: 180 },
  { name: 'Sonderfahrzeug', w: 0.12, km: 900, wk: 640 },
  { name: 'Dienst-Pkw (zivil)', w: 0.24, km: 1300, wk: 240 },
];
const FUHRPARK_ABT = ABTEILUNGEN.filter((a) =>
  /Fuhrpark|Logistik|Liegenschaften|Service|Telekommunikation|Stab/.test(a.name));
function buildFuhrpark() {
  const fakten = [];
  const zeitreihe = [];
  const BESTAND = 285;
  MONATE.forEach((mo) => {
    let best = 0, verf = 0, wk = 0, km = 0, alterSum = 0;
    FUHRPARK_ABT.forEach((ab) => {
      FZ_KLASSEN.forEach((kl) => {
        const b = Math.max(1, Math.round(BESTAND * (ab.w / 0.69) * kl.w * jitter(0.08)));
        const verfQuote = 0.90 + 0.045 * Math.sin(mo.idx / 3) * jitter(0.1) + 0.01 * trend(mo.idx);
        const v = Math.round(b * Math.min(0.985, Math.max(0.82, verfQuote)));
        const werk = b * kl.wk * seasonWinter(mo.monat) * 0.6 * jitter(0.18);
        const kmv = b * kl.km * (mo.monat >= 6 && mo.monat <= 9 ? 1.15 : 1) * jitter(0.12);
        best += b; verf += v; wk += werk; km += kmv;
        alterSum += b * (4.2 + rand() * 3);
        fakten.push({
          Monat: mo.key, Abteilung: ab.name, Fahrzeugklasse: kl.name,
          Bestand: b, Verfuegbar: v, Werkstattkosten: round(werk, 0), KM: round(kmv, 0),
        });
      });
    });
    zeitreihe.push({
      Monat: mo.key,
      Fahrzeugbestand: best,
      Verfuegbarkeitsquote: round((verf / best) * 100, 1),
      Werkstattkosten: round(wk, 0),
      KMLeistung: round(km, 0),
      FlottenalterDurchschnitt: round(alterSum / best, 1),
      Ausstattungsquote: round(94 + 4 * trend(mo.idx) + (rand() - 0.5), 1),
    });
  });
  const ziele = [
    z('Fahrzeugbestand', 290, 'hoch', 5),
    z('Verfuegbarkeitsquote', 93, 'hoch', 4),
    z('Werkstattkosten', 60000, 'niedrig', 15),
    z('KMLeistung', 430000, 'neutral', 20),
    z('FlottenalterDurchschnitt', 5.5, 'niedrig', 12),
    z('Ausstattungsquote', 98, 'hoch', 3),
  ];
  return { zeitreihe, fakten, ziele };
}

/* ----------------------------------------------------------------- *
 * Bereich 4: EINSATZ & AUSBILDUNG
 * ----------------------------------------------------------------- */
const EINSATZARTEN = [
  { name: 'Technische Unterstützung', w: 0.40, std: 1.0 },
  { name: 'Wartung & Service', w: 0.30, std: 0.8 },
  { name: 'Beschaffungsvorgang', w: 0.18, std: 0.4 },
  { name: 'Schulung & Fortbildung', w: 0.12, std: 0.6 },
];
function buildEinsatz(personalZR) {
  const fakten = [];
  const zeitreihe = [];
  MONATE.forEach((mo, i) => {
    const pStand = personalZR[i].Personalstand;
    let stunden = 0, anzahl = 0, schul = 0, teilnehmer = 0;
    ABTEILUNGEN.forEach((ab) => {
      EINSATZARTEN.forEach((ea) => {
        const an = Math.max(0, Math.round(pStand * ab.w * ea.w * 0.5 * jitter(0.2)));
        const st = an * (6 * ea.std) * jitter(0.15);
        const sd = ea.name === 'Schulung & Fortbildung'
          ? Math.round(pStand * ab.w * 0.12 * seasonUrlaub(mo.monat) * 0.5 * jitter(0.2)) : 0;
        const tn = ea.name === 'Schulung & Fortbildung' ? Math.round(sd * 1.4) : 0;
        stunden += st; anzahl += an; schul += sd; teilnehmer += tn;
        fakten.push({
          Monat: mo.key, Abteilung: ab.name, Einsatzart: ea.name,
          Stunden: round(st, 0), Anzahl: an, Schulungstage: sd, Teilnehmer: tn,
        });
      });
    });
    zeitreihe.push({
      Monat: mo.key,
      Einsatzstunden: round(stunden, 0),
      Einsaetze: anzahl,
      Schulungstage: schul,
      Fortbildungsquote: round((teilnehmer / pStand) * 100, 1),
      Anwaerter: Math.round(58 + 10 * Math.sin(mo.idx / 4) + 6 * trend(mo.idx) + rand() * 3),
    });
  });
  const ziele = [
    z('Einsatzstunden', 2900, 'neutral', 18),
    z('Einsaetze', 600, 'neutral', 18),
    z('Schulungstage', 130, 'hoch', 20),
    z('Fortbildungsquote', 10, 'hoch', 20),
    z('Anwaerter', 65, 'hoch', 15),
  ];
  return { zeitreihe, fakten, ziele };
}

function z(kennzahl, zielwert, richtung, toleranz) {
  return { Kennzahl: kennzahl, Zielwert: zielwert, Richtung: richtung, Toleranz: toleranz };
}

/* ----------------------------------------------------------------- *
 * Schreiben: XLSX je Bereich + gemeinsame Fallback-JS-Datei
 * ----------------------------------------------------------------- */
function writeWorkbook(name, bereich) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bereich.ziele), 'Ziele');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bereich.zeitreihe), 'Zeitreihe');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bereich.fakten), 'Fakten');
  if (bereich.budget) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bereich.budget), 'Budget');
  }
  XLSX.writeFile(wb, path.join(DATA_DIR, name + '.xlsx'));
}

function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(JS_DIR)) fs.mkdirSync(JS_DIR, { recursive: true });

  const personal = buildPersonal();
  const finanzen = buildFinanzen(personal.zeitreihe);
  finanzen.budget = buildBudget();
  const fuhrpark = buildFuhrpark();
  const einsatz = buildEinsatz(personal.zeitreihe);

  const model = {
    meta: {
      organisation: 'PTLS POL – Präsidium Technik, Logistik und Service der Polizei',
      stand: `${STAND.jahr}-${String(STAND.monat).padStart(2, '0')}`,
      monate: MKEYS,
      abteilungen: ABTEILUNGEN.map((a) => a.name),
      erzeugt: new Date().toISOString(),
    },
    bereiche: { personal, finanzen, fuhrpark, einsatz },
  };

  writeWorkbook('personal', personal);
  writeWorkbook('finanzen', finanzen);
  writeWorkbook('fuhrpark', fuhrpark);
  writeWorkbook('einsatz', einsatz);

  const banner = '/* AUTOMATISCH ERZEUGT von tools/generate-data.js – nicht manuell editieren.\n' +
    '   Dient als Offline-Fallback (file://) mit identischen Daten wie daten/*.xlsx. */\n';
  fs.writeFileSync(
    path.join(JS_DIR, 'fallback-data.js'),
    banner + 'window.POL_FALLBACK = ' + JSON.stringify(model) + ';\n'
  );

  const fz = personal.fakten.length + finanzen.fakten.length +
    fuhrpark.fakten.length + einsatz.fakten.length;
  console.log('OK – 4 Excel-Dateien + js/fallback-data.js erzeugt.');
  console.log(`   Monate: ${MKEYS[0]} … ${MKEYS[MKEYS.length - 1]} (${MKEYS.length})`);
  console.log(`   Personalstand aktuell: ${personal.zeitreihe[personal.zeitreihe.length - 1].Personalstand}`);
  console.log(`   Fakten-Zeilen gesamt: ${fz}`);
}

main();
