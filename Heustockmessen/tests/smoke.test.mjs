/* =============================================================
   Heustockmessen · End-to-End Smoke-Test (Playwright/Chromium)
   Testet gegen einen laufenden PHP-Server (api.php + SQLite),
   da fetch/Sessions echtes HTTP brauchen.

   Voraussetzung:
     1) PHP-Server starten, z. B.:
        cd Heustockmessen && rm -f data/heustock.sqlite* && php -S 127.0.0.1:8099
     2) node Heustockmessen/tests/smoke.test.mjs
   BASE_URL überschreibbar (Default http://127.0.0.1:8099).
   Erwartet eine FRISCHE Datenbank (Standard-Passwort Feuerwehr112!).
   Exit-Code != 0 bei Fehlern.
   ============================================================= */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function loadPlaywright() {
  const cands = ['playwright', '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js'];
  for (const c of cands) { try { return require(c); } catch (e) { /* weiter */ } }
  throw new Error('Playwright nicht gefunden – global oder lokal installieren.');
}
const { chromium } = loadPlaywright();

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8099';
const exePath = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const STD_PW = 'Feuerwehr112!';

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log((cond ? 'PASS' : 'FAIL') + ' · ' + name); };

const launchOpts = { args: ['--no-sandbox'] };
try { require('fs').accessSync(exePath); launchOpts.executablePath = exePath; } catch (e) { /* default */ }

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('dialog', (d) => d.accept());

try {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

  // --- Anmeldung ---
  ok('Login-Overlay sichtbar', await page.locator('#login-overlay').isVisible());
  await page.fill('#login-pass', 'falsch');
  await page.click('#login-btn');
  await page.locator('#login-fehler').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  ok('Falsches Passwort gemeldet', await page.locator('#login-fehler').isVisible());

  await page.fill('#login-pass', STD_PW);
  await page.click('#login-btn');
  await page.waitForSelector('#app:not([hidden])', { timeout: 5000 });
  ok('App nach Login sichtbar', await page.locator('#app').isVisible());
  ok('Server verbunden', (await page.locator('#verbindung').textContent()).includes('verbunden'));

  // --- Stammdaten anlegen: Messstelle → Halle → Orte ---
  await page.click('.nav-btn[data-view="messstellen"]');
  await page.waitForTimeout(150);
  await page.fill('.stelle-neu input:nth-child(1)', 'Hof Müller');
  await page.click('.stelle-neu .btn.primaer');
  await page.waitForTimeout(300);
  ok('Messstelle angelegt', await page.locator('.stelle-karte').count() >= 1);

  // Halle anlegen
  await page.fill('.halle-neu input', 'Halle 1');
  await page.click('.halle-neu .btn:has-text("+ Halle")');
  await page.waitForTimeout(300);
  ok('Halle angelegt', await page.locator('.halle-block').count() === 1);

  // Orte über Schnellbuttons
  await page.click('.ort-neu .schnell .btn:has-text("Oben")');
  await page.waitForTimeout(250);
  await page.click('.ort-neu .schnell .btn:has-text("Mitte")');
  await page.waitForTimeout(250);
  ok('2 Orte angelegt', await page.locator('.ort-edit').count() === 2);

  // Sortierung: zweiten Ort (Mitte) nach oben
  ok('Sortier-Knöpfe vorhanden', await page.locator('.ort-edit .sort-knoepfe').count() === 2);
  await page.locator('.ort-edit').nth(1).locator('.sort-knoepfe .btn').first().click();
  await page.waitForTimeout(400);
  ok('Orte umsortiert (Mitte zuerst)', (await page.locator('.ort-edit .inline-edit').first().inputValue()) === 'Mitte');

  // --- Geführte Messung erfassen ---
  await page.click('.nav-btn[data-view="messung"]');
  await page.waitForTimeout(200);
  // Schritt 1: Kopfdaten
  ok('Wizard-Schritt 1 (Messstelle wählbar)', await page.locator('#m-stelle').count() === 1);
  ok('Foto-Feld vorhanden', await page.locator('#view-messung input[type="file"]').count() === 1);
  await page.fill('#m-temp', '20');
  await page.fill('#m-messer', 'Tester');
  await page.click('#view-messung .aktionsleiste .btn.primaer'); // Weiter →
  await page.waitForTimeout(200);

  // Schritt 2: Halle 1 mit ihren Orten
  const felder = page.locator('#view-messung .ebene-zeile .temp-feld');
  ok('2 Orte-Felder in Halle', await felder.count() === 2);
  ok('Sondentiefe-Feld je Ort', await page.locator('#view-messung .tiefe-feld').count() === 2);
  await page.locator('#view-messung .tiefe-feld').first().fill('150 cm');
  // Plausibilitätsprüfung
  await felder.nth(0).fill('200');
  await page.waitForTimeout(100);
  ok('Unplausibler Wert (200 °C) markiert', (await felder.nth(0).getAttribute('class')).includes('unplausibel'));
  await felder.nth(0).fill('75');
  await page.waitForTimeout(100);
  ok('75°C wird rot markiert', (await felder.nth(0).getAttribute('class')).includes('s-rot'));
  await felder.nth(1).fill('30');
  await page.waitForTimeout(100);
  ok('30°C wird grün markiert', (await felder.nth(1).getAttribute('class')).includes('s-gruen'));

  // Weiter zur Übersicht, dann speichern
  await page.click('#view-messung .aktionsleiste .btn.primaer'); // Zur Übersicht →
  await page.waitForTimeout(200);
  ok('Übersicht zeigt Werte', await page.locator('#view-messung .werte-tab').count() >= 1);
  await page.click('#view-messung .aktionsleiste .btn.primaer'); // Speichern
  await page.waitForTimeout(600);
  ok('Speichern bestätigt', (await page.locator('#meldung').textContent()).includes('gespeichert'));

  // --- Verlauf ---
  await page.click('.nav-btn[data-view="verlauf"]');
  await page.waitForTimeout(250);
  ok('1 Messreihe im Verlauf', await page.locator('#view-verlauf .reihe').count() === 1);
  ok('Messstelle im Verlauf', (await page.locator('#view-verlauf .r-stelle').first().textContent()).includes('Hof Müller'));
  ok('Max-Badge zeigt Brandgefahr-Stufe (rot)',
    await page.locator('#view-verlauf .reihe summary .badge.s-rot').count() === 1);
  ok('Werte-Tabelle hat 2 Wertezeilen', await page.locator('#view-verlauf .werte-tab tr').count() === 3); // inkl. Kopf

  // --- Verlauf-Werkzeuge & Filter ---
  ok('Excel-Export vorhanden', await page.locator('#view-verlauf .export-jahr .btn').count() === 1);
  ok('Filterleiste vorhanden', await page.locator('#view-verlauf .filterleiste').count() === 1);
  ok('Trend-Spalte vorhanden', (await page.locator('#view-verlauf .werte-tab th').allTextContents()).includes('Trend'));
  ok('Backup-Button vorhanden', await page.locator('#view-verlauf .werkzeuge .btn:has-text("Backup")').count() === 1);

  // Tagesbericht erzeugen (Druck unterdrücken)
  ok('Tagesbericht-Knopf vorhanden', await page.locator('#view-verlauf .werkzeuge .btn:has-text("Tagesbericht")').count() === 1);
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#view-verlauf .werkzeuge .btn:has-text("Tagesbericht")');
  await page.waitForTimeout(200);
  ok('Tagesbericht enthält Messstelle', await page.locator('#bericht-druck .b-reihe').count() >= 1);
  await page.evaluate(() => document.body.classList.remove('drucke-bericht'));

  // Filter „nur kritische" greift (75°C ist kritisch → Reihe bleibt sichtbar)
  await page.check('#view-verlauf .check input[type="checkbox"]');
  await page.waitForTimeout(150);
  ok('Filter nur-kritische zeigt die Reihe', await page.locator('#view-verlauf .reihe').count() === 1);
  await page.uncheck('#view-verlauf .check input[type="checkbox"]');
  await page.waitForTimeout(150);

  // --- Diagramm (alle Orte einer Messstelle zusammen) ---
  await page.click('.nav-btn[data-view="diagramm"]');
  await page.waitForTimeout(300);
  ok('Diagramm: Messstelle + Halle wählbar', await page.locator('#view-diagramm select').count() === 2);
  ok('Diagramm zeichnet Punkte', await page.locator('#view-diagramm svg.chart .pkt').count() >= 1);
  ok('Diagramm-Legende je Ort', await page.locator('#view-diagramm .diag-leg-eintrag').count() === 2);
  ok('Diagramm: Gefahren-Zonen gezeichnet', await page.locator('#view-diagramm svg.chart rect').count() >= 3);

  // --- PWA-Installations-Banner (simuliertes Event) ---
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  await page.waitForTimeout(100);
  ok('Install-Banner erscheint', await page.locator('#install-banner').isVisible());

  // --- Dashboard ---
  await page.click('.nav-btn[data-view="dashboard"]');
  await page.waitForTimeout(200);
  ok('Dashboard zeigt Messstelle', await page.locator('#view-dashboard .dash-karte').count() === 1);
  ok('Dashboard-Badge (rot) sichtbar', await page.locator('#view-dashboard .dash-karte .badge.s-rot').count() === 1);

  // --- Schwellenwerte konfigurieren ---
  await page.click('#view-dashboard .werkzeuge .btn:has-text("Schwellenwerte")');
  await page.waitForTimeout(150);
  ok('Schwellen-Dialog offen', await page.locator('#schwellen-overlay').isVisible());
  await page.click('#sw-stroh');
  ok('Preset Stroh setzt 65 °C', await page.locator('#sw-rot').inputValue() === '65');
  await page.click('#sw-speichern');
  await page.locator('#schwellen-overlay').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  ok('Schwellen gespeichert', await page.locator('#schwellen-overlay').isHidden());

  // --- Messstelle duplizieren ---
  await page.click('.nav-btn[data-view="messstellen"]');
  await page.waitForTimeout(150);
  await page.click('.stelle-kopf .btn:has-text("Duplizieren")');
  await page.waitForTimeout(400);
  ok('Messstelle dupliziert', await page.locator('.stelle-karte').count() === 2);

  // --- Passwort ändern und zurücksetzen ---
  await page.click('#btn-einstellungen');
  await page.waitForTimeout(150);
  await page.fill('#pw-alt', STD_PW);
  await page.fill('#pw-neu', 'Test999!');
  await page.fill('#pw-neu2', 'Test999!');
  await page.click('#pw-speichern');
  // Erfolg schließt den Dialog.
  let geaendert = await page.locator('#pw-overlay').waitFor({ state: 'hidden', timeout: 5000 })
    .then(() => true).catch(() => false);
  ok('Passwort geändert', geaendert);

  // zurücksetzen auf Standard, damit Re-Runs klappen
  await page.click('#btn-einstellungen');
  await page.locator('#pw-overlay').waitFor({ state: 'visible', timeout: 3000 });
  await page.fill('#pw-alt', 'Test999!');
  await page.fill('#pw-neu', STD_PW);
  await page.fill('#pw-neu2', STD_PW);
  await page.click('#pw-speichern');
  let zurueck = await page.locator('#pw-overlay').waitFor({ state: 'hidden', timeout: 5000 })
    .then(() => true).catch(() => false);
  ok('Passwort zurückgesetzt', zurueck);

  // --- Logout ---
  await page.click('#btn-logout');
  await page.waitForTimeout(300);
  ok('Nach Logout wieder Login-Overlay', await page.locator('#login-overlay').isVisible());

  ok('Keine JS-Fehler', errors.length === 0);
  if (errors.length) console.log('  Fehler:', errors.join('\n  '));

} catch (e) {
  fail++;
  console.log('FAIL · Ausnahme: ' + e.message);
} finally {
  await browser.close();
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen.`);
process.exit(fail ? 1 : 0);
