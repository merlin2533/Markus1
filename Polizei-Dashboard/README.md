# PTLS POL – Finanz- & Personal-Dashboard

Lokales HTML-Dashboard für die Gesamtübersicht des **Präsidiums Technik
(PTLS POL – Präsidium Technik, Logistik und Service der Polizei)**, ca. 1.200
Mitarbeitende. Reines HTML + Vanilla-JavaScript, keine Installation nötig.

> Demodaten – nicht zur dienstlichen Verwendung. Alle Zahlen sind generiert.

## Schnellstart

Wegen des automatischen Ladens der Excel-Dateien einen kleinen lokalen
Webserver starten (Browser blockieren `fetch` auf `file://`):

```bash
cd Polizei-Dashboard
python3 -m http.server 8000
```

Dann im Browser öffnen: <http://localhost:8000/>

Alternativ lässt sich `index.html` auch direkt per Doppelklick (`file://`)
öffnen – dann werden automatisch die **eingebetteten Demodaten**
(`js/fallback-data.js`) verwendet und ein Hinweis-Banner eingeblendet.

## Funktionen

- **Sidebar-Navigation** über alle Bereiche.
- **Cockpit / Lagebild** (Startseite): Ampel-Status je Bereich, Top-Abweichungen
  des Monats, Leit-Kennzahlen – Klick führt zur Detailseite.
- **4 Bereiche** mit KPI-Karten (Aktuell · Δ Vormonat · Ampel · Sparkline):
  Personal, Finanzen, Fuhrpark & Ausstattung, Einsatz & Ausbildung.
- **Detailseiten** je Kennzahl: Verlauf + Ziel-Linie, Vergleich Vormonat/Vorjahr
  (YoY)/YTD, Aufschlüsselung nach Dimension, Excel-Export.
- **Personalrisiko**: Pensionierungs-/Altersabgangswelle und Nachbesetzungsbedarf.
- **Ad-hoc / Pivot** (PivotTable.js): Felder per Drag&Drop, Aggregationen,
  Diagramme, Excel-Export der Ansicht.
- **Management-Bericht**: druck-/PDF-optimierte Gesamtansicht mit
  Bewertungsfeldern (lokal gespeichert).
- **Drucken** (`🖨️`) für jede Ansicht; Sidebar/Topbar werden ausgeblendet.

## Verzeichnis & Datenmodell

```
Polizei-Dashboard/
  index.html, styles.css
  daten/        personal|finanzen|fuhrpark|einsatz .xlsx  (Auto-Load)
  js/           Module + fallback-data.js (Offline-Daten)
  tools/        generate-data.js (Daten-Generator)
```

Jede Bereichs-Excel hat drei Sheets:

- **`Ziele`** – `Kennzahl`, `Zielwert`, `Richtung` (hoch/niedrig/neutral),
  `Toleranz` (% für die gelbe Ampelzone).
- **`Zeitreihe`** – Spalte `Monat` (`2024-06` … `2026-06`) + je Kennzahl eine
  Wertspalte. „Aktuell" = letzter Monat, „Vormonat" = vorletzter, „YoY" = −12.
- **`Fakten`** – tidy/lang: `Monat`, Dimensionen (`Abteilung`, bei Personal
  zusätzlich `Beamtenstatus`, `Laufbahngruppe`, `Geschlecht`, `Altersgruppe`)
  + additive Messgrößen. Basis für Aufschlüsselungen und die Pivot-Seite.

## Eigene Daten verwenden

1. **Dateien ersetzen:** `daten/*.xlsx` mit identischen Sheet-/Spaltennamen
   überschreiben und neu laden.
2. **Import-Button:** oben rechts „Excel-Import" – der Bereich wird aus dem
   Dateinamen abgeleitet (er muss `personal`, `finanzen`, `fuhrpark` oder
   `einsatz` enthalten).

## Demodaten neu erzeugen

```bash
cd Polizei-Dashboard/tools
npm install xlsx            # einmalig (nur für den Generator)
node generate-data.js       # schreibt daten/*.xlsx + js/fallback-data.js
```

## Technik

Vanilla-JS im `POL`-Namespace, ohne Build-Tooling. Bibliotheken via CDN:
SheetJS (`xlsx`), Chart.js, jQuery/jQuery-UI, PivotTable.js.
