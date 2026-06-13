# Konzept – PTLS POL Finanz- & Personal-Dashboard

## Zweck

Gesamtüberblick für die **Präsidialebene** des Präsidiums Technik (PTLS POL –
Präsidium Technik, Logistik und Service der Polizei, ≈ 1.200 Mitarbeitende).
Ein lokal lauffähiges HTML-Dashboard zeigt Kennzahlen mehrerer Themenbereiche –
jeweils **heute**, im **Verlauf** und mit **Referenz Vormonat** – verlinkt von
jeder Kennzahl auf eine Detailseite, bietet eine **Druck-/PDF-Funktion** und
eine separate **Ad-hoc-/Pivot-Seite**. Die Beispieldaten liegen als echte
Excel-Dateien im Verzeichnis und werden beim Start automatisch geladen.

## Bereiche (Sidebar)

| Bereich | Beispiel-Kennzahlen |
|---|---|
| **Personal** | Personalstand, Krankenstandquote/Krankheitstage, Urlaubstage, Resturlaub, Überstunden, Fluktuation, Durchschnittsalter, Teilzeitquote, Frauenanteil |
| **Finanzen** | Gesamtkosten, Budgetausschöpfung (YTD), Personal-/Sach-/Überstundenkosten, Investitionen, Kosten pro Kopf |
| **Fuhrpark & Ausstattung** | Fahrzeugbestand, Verfügbarkeitsquote, Werkstattkosten, km-Leistung, Flottenalter, Ausstattungsquote |
| **Einsatz & Ausbildung** | Einsatz-/Unterstützungsstunden, Einsätze/Vorgänge, Schulungstage, Fortbildungsquote, Anwärter |

## Dimensionen (Präsidium Technik)

- **Abteilung:** IT, Telekommunikation & Leitstellentechnik, Fuhrpark/Kfz,
  Waffen/Gerät & Einsatzmittel, Liegenschaften & Bau, Logistik/Beschaffung,
  Service & Bekleidung, Zentrale Dienste/Stab.
- **Beamtenstatus:** Beamte / Nicht-Beamte (Tarifbeschäftigte).
- **Laufbahngruppe:** mittlerer / gehobener / höherer Dienst / Tarif (EG).
- **Geschlecht**; **Altersgruppe** (<30, 30–39, 40–49, 50–59, ≥60).

## Präsidenten-/Cockpit-Sicht (Erweiterungen)

- **Cockpit / Lagebild** als Startseite: Ampel-Status (grün/gelb/rot) je Bereich,
  Top-Abweichungen des Monats, Drill-down per Klick.
- **Zielwerte (Soll/Ist):** je Kennzahl Ziel + Ampel; Sheet `Ziele` mitpflegbar.
- **YTD & Vorjahresvergleich (YoY) + Prognose:** kumulierte Jahressicht,
  Vorjahresmonat, lineare Hochrechnung auf Jahresende.
- **Management-Bericht:** druck-/PDF-optimierte Gesamtansicht mit
  Bewertungstext je Bereich (lokal gespeichert).
- **Personalrisiko:** Pensionierungs-/Altersabgangswelle, Nachbesetzungsbedarf
  nach Beamtenstatus.

## Datenmodell

Drei Sheets je Bereichs-Excel:

- **`Ziele`** – `Kennzahl`, `Zielwert`, `Richtung`, `Toleranz`.
- **`Zeitreihe`** – `Monat` + je Kennzahl eine Wertspalte (25 Monate).
- **`Fakten`** – tidy: `Monat` + Dimensionen + additive Messgrößen.

Die Kennzahlen werden deterministisch (seeded) mit realistischen Niveaus,
Saisonalität (Krankenstand Winter↑, Urlaub Sommer↑) und leichtem Trend erzeugt.

## Architektur

Reines HTML + Vanilla-JS im `POL`-Namespace, kein Build. Module unter `js/`:
`state` (Format/Helfer), `kpi` (Registry + Berechnungen), `data` (Excel-Load +
Fallback), `charts` (Chart.js), `cards`, `cockpit`, `views`, `detail`, `risk`,
`report`, `pivot`, `router`, `print`, `app`. Bibliotheken via CDN (SheetJS,
Chart.js, jQuery/jQuery-UI, PivotTable.js). Auto-Load der Excel per `fetch`,
mit Offline-Fallback (`js/fallback-data.js`). Druck über `@media print` und
`.no-print` / `.print-keep`.

Generiert von `tools/generate-data.js` (Node + SheetJS). Siehe `README.md` für
Start und Datenpflege, `PROMPT.md` für einen reproduzierbaren Prompt.
