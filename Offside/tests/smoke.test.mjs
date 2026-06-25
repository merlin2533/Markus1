/* =============================================================
   Offside · End-to-End Smoke-Test (Playwright/Chromium)
   Lädt index.html als file:// und prüft die Kernfunktionen.
   Aufruf:  node Offside/tests/smoke.test.mjs
   Voraussetzung: Playwright + Chromium (in der Web-Umgebung
   bereits vorhanden). Exit-Code != 0 bei Fehlern.
   ============================================================= */
import { createRequire } from 'module';
import path from 'path';
import url from 'url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js'
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* nächster Kandidat */ }
  }
  throw new Error('Playwright nicht gefunden. Bitte `npm i -D playwright` oder global installieren.');
}
const { chromium } = loadPlaywright();

const here = path.dirname(url.fileURLToPath(import.meta.url));
const indexPath = path.resolve(here, '..', 'index.html');
const exePath = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); };

const launchOpts = {};
try { require('fs').accessSync(exePath); launchOpts.executablePath = exePath; } catch (e) { /* Default-Browser */ }

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('dialog', d => d.accept());

await page.goto('file://' + indexPath, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
// frischer Start
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);

ok('9 Knoten gerendert', await page.locator('#chart .node').count() === 9);
ok('Kanten gerendert', await page.locator('#chart .edges path').count() === 8);
ok('Status-Punkte vorhanden', await page.locator('#chart .node circle').count() === 9);

// Multi-Plan
await page.evaluate(() => State.createPlan('B'));
await page.waitForTimeout(120);
ok('2 Pläne', await page.locator('#plan-select option').count() === 2);
ok('Neuer Plan leer', await page.locator('#chart .node').count() === 0);

// Backup-Roundtrip (alle Pläne)
const backup = await page.evaluate(() => JSON.stringify(State.exportWorkspace()));
ok('Backup enthält 2 Pläne', Object.keys(JSON.parse(backup).plaene).length === 2);
await page.evaluate(() => { State.deletePlan(); }); // zurück auf 1
await page.evaluate((b) => State.importWorkspace(JSON.parse(b)), backup);
await page.waitForTimeout(120);
ok('Restore stellt 2 Pläne her', await page.locator('#plan-select option').count() === 2);

// zurück auf DEMO-Plan
await page.evaluate(() => State.switchPlan(Object.keys(State.exportWorkspace().plaene)[0]));
await page.waitForTimeout(120);
ok('DEMO-Plan aktiv (9 Knoten)', await page.locator('#chart .node').count() === 9);

// Integrität
const integ = await page.evaluate(() => {
  const t = State.get().teilnehmer.find(x => x.name === 'LtdPD Maier');
  State.updateTeilnehmer(t.id, { name: 'NEU' });
  const dangling = State.get().elemente.filter(e => e.zuordnung === 'LtdPD Maier' || (e.teilnehmer || []).includes('LtdPD Maier')).length;
  return dangling;
});
ok('Keine toten Verweise nach Umbenennen', integ === 0);
await page.evaluate(() => State.undo());

// Status/Termin
const stz = await page.evaluate(() => {
  const e = State.get().elemente[0];
  State.updateElement(e.id, { status: 'kritisch', termin: '2026-12-01' });
  return State.get().elemente[0];
});
ok('Status gesetzt', stz.status === 'kritisch');
ok('Termin gesetzt', stz.termin === '2026-12-01');

// Element duplizieren
const before = await page.locator('#chart .node').count();
await page.evaluate(() => { State.select(State.get().elemente[0].id); State.duplicateElement(State.selectedId()); });
await page.waitForTimeout(120);
ok('Duplizieren erzeugt Knoten', await page.locator('#chart .node').count() === before + 1);
await page.evaluate(() => State.undo());

// Verbindung Richtung umdrehen
const flip = await page.evaluate(() => {
  const v = State.get().verbindungen[0]; const von = v.von, bis = v.bis;
  State.updateVerbindung(v.id, { von: v.bis, bis: v.von });
  const n = State.get().verbindungen[0];
  return n.von === bis && n.bis === von;
});
ok('Verbindung umgedreht', flip);

// Timeline + Auswertung
await page.locator('.tab[data-tab="timeline"]').click();
await page.waitForTimeout(120);
ok('Timeline-Zeilen', await page.locator('.tl-row').count() > 0);
await page.locator('.tab[data-tab="auswertung"]').click();
await page.waitForTimeout(120);
ok('Status-Balken in Auswertung', (await page.locator('.bar-row').count()) > 0);

// Filter nach Status
await page.locator('.tab[data-tab="detail"]').click();
await page.selectOption('#flt-status', 'erledigt');
await page.waitForTimeout(150);
ok('Status-Filter graut aus', await page.locator('#chart .node.dimmed').count() > 0);
await page.click('#flt-clear');

// Excel-Roundtrip
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-xlsx')]);
const tmp = path.resolve(here, 'tmp_export.xlsx');
await dl.saveAs(tmp);
await page.setInputFiles('#file-import', tmp);
await page.waitForTimeout(300);
ok('Excel-Import nach Export', await page.locator('#chart .node').count() >= 9);
require('fs').unlinkSync(tmp);

ok('Keine Konsolenfehler', errors.length === 0);
if (errors.length) console.log('ERRORS:', errors);

await browser.close();
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail ? 1 : 0);
