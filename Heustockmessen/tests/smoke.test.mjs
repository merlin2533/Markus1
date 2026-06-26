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

  // --- Messstellen anlegen ---
  await page.click('.nav-btn[data-view="messstellen"]');
  await page.waitForTimeout(150);
  await page.fill('.stelle-neu input:nth-child(1)', 'Testscheune');
  await page.click('.stelle-neu .btn.primaer');
  await page.waitForTimeout(300);
  ok('Messstelle angelegt', await page.locator('.stelle-karte').count() >= 1);

  // Ebenen über Schnellbuttons
  await page.click('.ebene-neu .schnell .btn:has-text("Oben")');
  await page.waitForTimeout(250);
  await page.click('.ebene-neu .schnell .btn:has-text("Mitte")');
  await page.waitForTimeout(250);
  ok('2 Ebenen angelegt', await page.locator('.ebene-edit').count() === 2);

  // --- Messung erfassen ---
  await page.click('.nav-btn[data-view="messung"]');
  await page.waitForTimeout(200);
  const felder = page.locator('#view-messung .ebene-zeile .temp-feld');
  ok('2 Temperatur-Felder', await felder.count() === 2);

  await felder.nth(0).fill('75');
  await page.waitForTimeout(100);
  ok('75°C wird rot markiert', (await felder.nth(0).getAttribute('class')).includes('s-rot'));
  await felder.nth(1).fill('30');
  await page.waitForTimeout(100);
  ok('30°C wird grün markiert', (await felder.nth(1).getAttribute('class')).includes('s-gruen'));

  await page.fill('#m-temp', '20');
  await page.fill('#m-messer', 'Tester');
  await page.click('#view-messung .aktionsleiste .btn.primaer');
  await page.waitForTimeout(500);
  ok('Speichern bestätigt', (await page.locator('#meldung').textContent()).includes('gespeichert'));

  // --- Verlauf ---
  await page.click('.nav-btn[data-view="verlauf"]');
  await page.waitForTimeout(250);
  ok('1 Messreihe im Verlauf', await page.locator('#view-verlauf .reihe').count() === 1);
  ok('Max-Badge zeigt Brandgefahr-Stufe (rot)',
    await page.locator('#view-verlauf .reihe summary .badge.s-rot').count() === 1);
  ok('Werte-Tabelle hat 2 Zeilen', await page.locator('#view-verlauf .werte-tab tr').count() === 3); // inkl. Kopf

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
