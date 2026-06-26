# Heustockmessen · Freiwillige Feuerwehr

Webanwendung zur **Temperaturüberwachung von Heustöcken/Heulagern**. Heu kann
durch mikrobielle Selbsterhitzung in Brand geraten – mit dieser App
dokumentiert die Feuerwehr regelmäßige Temperaturmessungen, erkennt kritische
Werte über eine **Ampel** und hält den Verlauf nach.

Im Gegensatz zu den übrigen Projekten dieses Repositories ist dies **keine reine
Offline-App**: Damit **mehrere Personen denselben Datenbestand** sehen, läuft die
Speicherung über ein kleines **PHP-Backend mit SQLite-Datenbank** auf dem Server.

---

## Aufbau / Datenmodell

Hierarchie in drei Ebenen – so, wie man vor Ort vorgeht (man fährt die
Messstelle an, darin gibt es Hallen, darin die einzelnen Orte):

- **Messstelle** – der Standort, den man anfährt (z. B. „Hof Müller"). Kann
  **mehrere Hallen** enthalten.
- **Halle** – ein Gebäude/Lager an der Messstelle (z. B. „Halle 1").
- **Ort** – ein Messpunkt in der Halle: **Oben / Mitte / Unten** oder eine
  **beliebige eigene Bezeichnung** (Schnellbuttons für die Standard-Orte).
- **Messreihe** – ein **Messbesuch an einer Messstelle** mit Zeitpunkt,
  **Außentemperatur**, Erfasser/in und Notiz. Pro Ort wird ein Wert erfasst.
- **Messwert** – eine einzelne Temperatur an einem Ort innerhalb einer Messreihe.

Messstellen, Hallen und Orte sind die **Stammdaten** (einmal anlegen); die
**Messreihen** kommen bei jedem Kontrollgang dazu.

## Funktionen

- **Start-Dashboard**: Übersicht aller Messstellen mit Höchstwert (Ampel),
  „zuletzt gemessen vor X Tagen", erfasste/gesamte Orte und „Kontrolle fällig" –
  die kritischsten zuerst. Direkt von dort messen oder den Verlauf öffnen.
- **Geführte Erfassung (Schritt für Schritt)**: Messstelle wählen → Kopfdaten →
  **Halle für Halle** die Orte eingeben (mit Fortschrittsanzeige) → Übersicht →
  speichern. Temperaturfelder färben sich live nach Warnstufe. Je Ort optional
  **Sondentiefe/-position** und eine **Notiz**.
- **Foto/Beleg je Messung**: optional ein Bild (z. B. der Sondenanzeige)
  aufnehmen; wird verkleinert gespeichert und im Verlauf angezeigt.
- **Konfigurierbare Schwellenwerte** (⚙ im Dashboard): Richtwerte für **Heu**
  oder **Stroh** als Voreinstellung, frei anpassbar; serverseitig gespeichert.
- **Messstelle duplizieren**: Hallen-/Orte-Struktur als Vorlage auf eine neue
  Messstelle kopieren.
- **Erfasser/in**: bekannte Namen aus bisherigen Messreihen stehen zur Auswahl;
  der zuletzt genutzte Name wird automatisch vorausgefüllt.
- **Außentemperatur**: zentral pro Messreihe – **manuell** oder per Knopf
  **automatisch** über den Standort des Geräts (Browser-Geolocation +
  [Open-Meteo](https://open-meteo.com/), nutzt u. a. DWD-ICON-Daten, kein
  API-Schlüssel). Standort (Lat/Lon) und Quelle werden mitgespeichert.
- **Warnstufen (Ampel)** – Richtwerte der Heustocküberwachung:

  | Temperatur | Stufe | Bedeutung |
  |-----------:|-------|-----------|
  | < 45 °C    | 🟢 Unbedenklich | Normaler Bereich |
  | ≥ 45 °C    | 🟡 Erhöht       | Beginnende Selbsterhitzung – täglich kontrollieren |
  | ≥ 60 °C    | 🟠 Kritisch     | Engmaschig kontrollieren, Feuerwehr informieren |
  | ≥ 70 °C    | 🔴 Akute Brandgefahr | Feuerwehr/Fachberater – Heu nur unter Aufsicht ausräumen |

  Die Standard-Schwellen (Heu) sind in der App unter **⚙ Schwellenwerte**
  anpassbar (Preset Heu/Stroh), die Texte je Stufe in `js/app.js` (`STUFEN_TEXT`).
- **Verlauf & Auswertung**: alle Messreihen, je Reihe der Höchstwert mit
  Stufen-Badge, Werte-Tabelle (nach Halle gruppiert), Bearbeiten/Löschen.
- **Trend je Ort**: Pfeil ▲/▼/▶ + Δ°C gegenüber der letzten Messung am selben
  Ort – der Anstieg ist das wichtigste Warnsignal.
- **Vollständigkeitskontrolle**: vor dem Speichern wird auf noch nicht gemessene
  Orte hingewiesen; Speichern ist möglich, aber mit Nachfrage.
- **Live-Update**: messen mehrere Personen gleichzeitig, aktualisiert sich die
  Ansicht automatisch (Revisions-Abgleich alle 15 s).
- **Offline-Puffer**: kein WLAN im Stall? Messungen werden lokal zwischen­ge­speichert
  und automatisch übertragen, sobald wieder Verbindung besteht (Badge im Kopf).
- **Filter** im Verlauf: nach Messstelle, Halle, Zeitraum und „nur kritische".
- **Diagramm**: Temperaturverlauf **aller Orte einer Messstelle** (oder einer
  Halle) gemeinsam – je Ort eine farbige, weiche Kurve mit End-Wert, dazu
  farbige Gefahren-Zonen im Hintergrund, Schwellen-Beschriftung und Legende.
- **Reihenfolge** der Hallen und Orte per ▲/▼ sortierbar.
- **Plausibilitätsprüfung**: unrealistische Temperaturen (< −20 / > 150 °C)
  werden markiert und vor dem Speichern abgefragt (Tippfehler).
- **Excel-Export** der Messwerte (optional nach Jahr gefiltert; SheetJS lokal).
- **Backup/Wiederherstellen** des gesamten Datenbestands als JSON-Datei.
- **PWA**: „Zum Startbildschirm hinzufügen", Vollbild, App-Shell offline
  (Service Worker), App-Icon. Ein **Installations-Banner** erscheint, sobald
  der Browser die Installation anbietet.
- **Für Smartphone und Desktop optimiert**: große Touch-Felder, beim Erfassen
  unten andockende Bedienleiste, sticky Navigation, horizontal scrollbare
  Tabellen, Berücksichtigung der Geräte-Ränder (Notch/Safe-Area).
- **Tagesbericht (HTML/PDF)**: sauber aufbereiteter Bericht für einen
  gewählten Tag – Kopf mit Datum, Zusammenfassung (Messungen, Höchstwert,
  kritische Werte), je Messstelle eine Tabelle (Halle/Ort/Tiefe/Temperatur/
  Bewertung/Notiz) und Unterschriftszeile. Über „📄 Tagesbericht" im Verlauf.
- **Drucken / PDF**: Verlauf als Bericht – je Messung eine Seite mit
  Unterschriftszeile (`print.css`).
- **Passwortschutz**: gemeinsames Passwort, in der DB als Hash gespeichert.
  **Standard bei Erstinstallation: `Feuerwehr112!`** – in der App unter
  **⚙ Passwort** änderbar. Schreibende Anfragen sind per **CSRF-Token** geschützt.

## Installation auf dem Server

Voraussetzung: Webspace mit **PHP ≥ 7.4** (mit `pdo_sqlite`, Standard).

1. Ordner `Heustockmessen/` auf den Server kopieren.
2. Verzeichnis `data/` muss für PHP **schreibbar** sein (die Datei
   `data/heustock.sqlite` wird beim ersten Aufruf automatisch angelegt).
3. `index.html` im Browser öffnen, mit `Feuerwehr112!` anmelden, Passwort
   ändern, Messstellen anlegen – fertig.

### Datenbank vor direktem Zugriff schützen

Die SQLite-Datei liegt in `data/`. Der Zugriff darüber wird unterbunden:

- **Apache**: per mitgelieferter `data/.htaccess` (`Require all denied`).
- **IIS**: per mitgelieferter `web.config`.
- **nginx**: bitte selbst ergänzen, z. B.:
  ```nginx
  location ^~ /data/ { deny all; return 403; }
  ```

> Hinweis: Der eingebaute PHP-Entwicklungsserver (`php -S`) ignoriert
> `.htaccess` – er ist nur für lokale Tests gedacht, nicht für den Produktivbetrieb.

## Lokal testen

```bash
cd Heustockmessen
rm -f data/heustock.sqlite*          # frische DB
php -S 127.0.0.1:8099                # Server starten
# Browser: http://127.0.0.1:8099/index.html   (Passwort: Feuerwehr112!)
```

End-to-End-Smoke-Test (Playwright/Chromium, in der Claude-Web-Umgebung
vorinstalliert) – Server muss laufen:

```bash
node Heustockmessen/tests/smoke.test.mjs
# bzw. anderer Server:  BASE_URL=http://host:port node tests/smoke.test.mjs
```

Der Test (27 Checks) prüft Anmeldung (inkl. Fehlversuch), Stammdaten
(Messstelle/Halle/Orte), den geführten Ablauf, Ampel-Färbung, Speichern,
Verlauf inkl. Filter/Trend/Excel/Backup, Diagramm, Passwort ändern/zurücksetzen
und Logout. Der CSRF-Schutz wird implizit über die erfolgreichen POSTs geprüft.

## API (`api.php`)

JSON über `GET`/`POST`, Aktion im Feld `action`. Antwort immer
`{ ok: true, ... }` oder `{ ok: false, error }`.

| Aktion | Anmeldung | Zweck |
|--------|:--------:|-------|
| `ping`, `status` | – | Erreichbarkeit / Anmeldestatus (liefert CSRF-Token) |
| `login`, `logout` | – | An-/Abmelden (Session-Cookie) |
| `stand` | ✓ | Revisionsstand für das Live-Update |
| `passwort_aendern` | ✓ | Passwort ändern (`alt`, `neu`) |
| `stammdaten`, `messreihen`, `alles` | ✓ | Daten lesen |
| `schwellen_set` | ✓ | Warnschwellen speichern (gelb/orange/rot, material) |
| `messstelle_save` / `_delete` | ✓ | Messstelle anlegen/ändern/löschen |
| `messstelle_duplizieren` | ✓ | Messstelle samt Hallen/Orten kopieren |
| `halle_save` / `_delete` | ✓ | Halle anlegen/ändern/löschen |
| `ort_save` / `_delete` | ✓ | Ort anlegen/ändern/löschen |
| `messreihe_save` / `_delete` | ✓ | Messreihe inkl. Werte (atomar) |
| `restore` | ✓ | Backup einspielen (ersetzt gesamten Bestand) |

Löschungen kaskadieren (Messstelle → Hallen → Orte → Messwerte) über
Fremdschlüssel/`ON DELETE CASCADE`. Alle schreibenden Aufrufe (POST) erfordern
das **CSRF-Token** (Header `X-CSRF-Token`, vom Client automatisch gesetzt).

## Dateien

```
Heustockmessen/
├─ index.html            – Oberfläche (Login, Navigation, fünf Ansichten)
├─ styles.css            – Design (Feuerwehr-Rot), mobil-first
├─ print.css             – Druck-/PDF-Layout (Seite je Messung, Unterschrift)
├─ api.php               – PHP-Backend + SQLite (Auth, CSRF, CRUD, Restore, Schema)
├─ manifest.webmanifest  – PWA-Manifest
├─ sw.js                 – Service Worker (App-Shell offline)
├─ icon.svg              – App-Icon
├─ js/
│  ├─ api.js             – fetch-Client (CSRF-Handling)
│  ├─ weather.js         – Standort + Open-Meteo (Außentemperatur automatisch)
│  ├─ excel.js           – Excel-Export (SheetJS)
│  └─ app.js             – UI-Logik, Wizard, Filter, Trend, Diagramm, Offline
├─ vendor/xlsx.full.min.js – SheetJS (lokal, offline)
├─ data/                 – SQLite-DB zur Laufzeit (gesperrt, nicht versioniert)
├─ web.config            – IIS-Schutz für data/
└─ tests/smoke.test.mjs  – End-to-End-Test (27 Checks)
```
