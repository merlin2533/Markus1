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

- **Messstelle** – ein Ort/Lager (z. B. „Scheune Nord"). Hat eine optionale
  Beschreibung.
- **Ebene** – ein Messpunkt innerhalb der Messstelle: **Oben / Mitte / Unten**
  oder eine **beliebige eigene Bezeichnung**. (Schnellbuttons für die
  Standard-Ebenen.)
- **Messreihe** – ein Messdurchgang mit Zeitpunkt, **Außentemperatur**,
  Messer/in und Notiz. Pro Ebene wird ein Temperaturwert erfasst.
- **Messwert** – eine einzelne Temperatur an einer Ebene innerhalb einer
  Messreihe.

Messstellen und Ebenen sind die **Stammdaten** und werden einmal angelegt; die
**Messreihen** kommen bei jedem Kontrollgang dazu.

## Funktionen

- **Messung erfassen**: Temperatur je Ebene eingeben; Felder färben sich live
  nach Warnstufe.
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

  Die Schwellen sind zentral in `js/app.js` (`STUFEN`) anpassbar.
- **Verlauf & Auswertung**: alle Messreihen, je Reihe der Höchstwert mit
  Stufen-Badge, Werte-Tabelle, Bearbeiten/Löschen.
- **Drucken / PDF**: Verlauf als Bericht ausdrucken (`print.css`).
- **Passwortschutz**: gemeinsames Passwort, in der DB als Hash gespeichert.
  **Standard bei Erstinstallation: `Feuerwehr112!`** – in der App unter
  **⚙ Passwort** änderbar.

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

Der Test prüft Anmeldung (inkl. Fehlversuch), Stammdaten anlegen, Ampel-Färbung,
Messung speichern, Verlauf, Passwort ändern/zurücksetzen und Logout.

## API (`api.php`)

JSON über `GET`/`POST`, Aktion im Feld `action`. Antwort immer
`{ ok: true, ... }` oder `{ ok: false, error }`.

| Aktion | Anmeldung | Zweck |
|--------|:--------:|-------|
| `ping`, `status` | – | Erreichbarkeit / Anmeldestatus |
| `login`, `logout` | – | An-/Abmelden (Session-Cookie) |
| `passwort_aendern` | ✓ | Passwort ändern (`alt`, `neu`) |
| `stammdaten`, `messreihen`, `alles` | ✓ | Daten lesen |
| `messstelle_save` / `_delete` | ✓ | Messstelle anlegen/ändern/löschen |
| `ebene_save` / `_delete` | ✓ | Ebene anlegen/ändern/löschen |
| `messreihe_save` / `_delete` | ✓ | Messreihe inkl. Werte (atomar) |

Löschungen kaskadieren (Messstelle → Ebenen → Messwerte) über
Fremdschlüssel/`ON DELETE CASCADE`.

## Dateien

```
Heustockmessen/
├─ index.html        – Oberfläche (Login, Navigation, drei Ansichten)
├─ styles.css        – Design (Feuerwehr-Rot), mobil-first
├─ print.css         – Druck-/PDF-Layout des Verlaufs
├─ api.php           – PHP-Backend + SQLite (Auth, CRUD, Schema-Auto-Anlage)
├─ js/
│  ├─ api.js         – fetch-Client
│  ├─ weather.js     – Standort + Open-Meteo (Außentemperatur automatisch)
│  └─ app.js         – UI-Logik, Warnstufen
├─ data/             – SQLite-DB zur Laufzeit (gesperrt, nicht versioniert)
├─ web.config        – IIS-Schutz für data/
└─ tests/smoke.test.mjs – End-to-End-Test
```
