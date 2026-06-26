# Repository-Notizen für Claude

Dieses Repository enthält mehrere eigenständige, rein webbasierte HTML/JS-Anwendungen
(kein Build-Schritt, kein Server nötig – `index.html` im Browser öffnen).

## Projekte
- **Offside/** – Interaktiver Kommunikationsplan für Behörden (Polizei-Blau, DEMO-Daten).
  Hauptprojekt dieser Sitzung. Siehe `Offside/README.md`.
- **Heustockmessen/** – Temperaturüberwachung von Heustöcken bei der Freiwilligen
  Feuerwehr. **Mehrbenutzer** über ein PHP-Backend mit SQLite (`api.php`),
  Passwortschutz (Standard `Feuerwehr112!`), Außentemperatur manuell oder per
  Standort/Open-Meteo. Nicht rein offline. Siehe `Heustockmessen/README.md`.
- **Dashboard/**, **Polizei-Dashboard/**, **Protokoll/** – ältere eigenständige Apps.

## Offside – Architektur
Reine Vanilla-JS-SPA, Module über globale Objekte (kein Bundler):
- `js/data.js` – Stammdaten: Aktionsarten, Medien, Status, Hierarchie, DEMO-Daten;
  Helfer `demoDaten()`, `leererPlan()`.
- `js/state.js` – zentraler Zustand `State` (IIFE). **Multi-Plan-Store** im localStorage
  (Schema v2 `{version, aktivId, plaene}`, Migration von v1). Undo/Redo-History,
  referenzielle Integrität (Kaskade bei Umbenennen/Löschen), Workspace-Backup.
- `js/chart.js` – interaktives SVG-Board `Chart`: Drag (Maus+Touch), Zoom/Fit,
  Verbinden, Filter-Dimming, Swimlanes/Auto-Layout, Tastatur (Entf/Esc/Pfeile/Strg+D),
  Render-Optimierung über Struktur-Signatur.
- `js/excel.js` – `ExcelIO`: Export/Import als `.xlsx` (SheetJS, lokal in `vendor/`).
- `js/image.js` – `ImageIO`: PNG-Export (SVG→Canvas).
- `js/app.js` – `App`: UI-Verdrahtung (Toolbar, Pläne, Detail-Panel, Pflege-Reiter,
  Filterleiste, Timeline, Auswertung).
- `styles.css` / `print.css` – Design (Polizei-Blau) bzw. Druck-/PDF-Layout.

### Wichtige Konventionen
- **Keine neuen externen Laufzeit-Abhängigkeiten** – die App muss offline laufen.
  Externe Libraries werden lokal unter `vendor/` abgelegt (z. B. SheetJS).
- Alle Texte sind deutsch; DEMO-Charakter (Flag + Wasserzeichen) beibehalten.
- Datenänderungen laufen über die `State`-API (nicht direkt am Objekt), damit
  Persistenz, Undo/Redo und Integrität greifen.

## Tests
End-to-End-Smoke-Test mit Playwright/Chromium:

```bash
node Offside/tests/smoke.test.mjs
```

In der Claude-Web-Umgebung sind Playwright und Chromium vorinstalliert
(`/opt/pw-browsers/chromium`). Lokal: `npm i -D playwright` und ggf.
`PW_CHROMIUM=/pfad/zur/chromium` setzen. Der Test prüft Rendering, Multi-Plan,
Backup/Restore, Integrität, Status/Termin, Duplizieren, Verbindungen, Timeline,
Auswertung, Filter und den Excel-Roundtrip; Exit-Code != 0 bei Fehlern.
