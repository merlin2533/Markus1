# Reproduzierbarer Prompt

Mit diesem Prompt lässt sich das Dashboard von Grund auf neu erzeugen oder
weiterentwickeln. Bei Bedarf anpassen (Organisation, Bereiche, Kennzahlen).

---

Erstelle ein **lokal lauffähiges Dashboard als reines HTML + Vanilla-JavaScript**
(kein Build-Tooling, Bibliotheken via CDN) für die Gesamtübersicht des
**Präsidiums Technik (PTLS POL – Präsidium Technik, Logistik und Service der
Polizei)** mit rund **1.200 Mitarbeitenden**. Lege alles in einem Unterordner
`Polizei-Dashboard/` ab. UI durchgehend auf Deutsch.

**Aufbau:** linke **Sidebar** zur Navigation, Topbar mit Drucken/Bericht/Import.

**Bereiche (je KPI-Karten mit Aktuellwert, Δ zum Vormonat, Ampel und Sparkline,
verlinkt auf eine Detailseite):**
- **Personal:** Personalstand, Krankenstandquote/Krankheitstage, Urlaubstage,
  Resturlaub, Überstunden, Fluktuation, Durchschnittsalter, Teilzeitquote,
  Frauenanteil.
- **Finanzen:** Gesamtkosten, Budgetausschöpfung (YTD), Personal-/Sach-/
  Überstundenkosten, Investitionen, Kosten pro Kopf.
- **Fuhrpark & Ausstattung:** Bestand, Verfügbarkeit, Werkstattkosten,
  km-Leistung, Flottenalter, Ausstattungsquote.
- **Einsatz & Ausbildung:** Einsatzstunden, Einsätze, Schulungstage,
  Fortbildungsquote, Anwärter.

**Dimensionen:** Abteilung (Technik/Logistik/Service-Struktur), **Beamtenstatus
(Beamte / Nicht-Beamte)**, Laufbahngruppe, Geschlecht, Altersgruppe.

**Kennzahlen-Darstellung:** je Kennzahl immer **heute**, **Verlauf** und
**Referenz Vormonat**; auf den Detailseiten zusätzlich Ziel-Linie,
Vorjahresvergleich (YoY), YTD und Aufschlüsselung nach Dimension mit
Excel-Export.

**Präsidenten-Sicht:**
- **Cockpit/Lagebild** als Startseite mit Ampel-Status (grün/gelb/rot) je
  Bereich, Top-Abweichungen des Monats und Drill-down.
- **Zielwerte (Soll/Ist)** je Kennzahl als pflegbares Excel-Sheet `Ziele`.
- **YTD/YoY + einfache Prognose** (Hochrechnung Jahresende).
- **Management-Bericht** als druck-/PDF-optimierte Gesamtansicht mit
  Bewertungstext je Bereich.
- **Personalrisiko:** Pensionierungs-/Altersabgangswelle und Nachbesetzungs-
  bedarf aus der Altersstruktur.
- **Ad-hoc-/Pivot-Seite** mit Drag&Drop (PivotTable.js) und Excel-Export.
- **Druckfunktion** (Sidebar/Topbar ausgeblendet).

**Daten:** Erzeuge **echte Excel-Dateien** je Bereich im Verzeichnis `daten/`
(Sheets `Ziele`, `Zeitreihe`, `Fakten`), die beim Start automatisch geladen
werden (`fetch` + SheetJS). Zahlen kreativ, aber plausibel (Saisonalität,
Trend), deterministisch generiert. Ergänze einen Offline-Fallback mit
identischen Daten, falls die Datei über `file://` geöffnet wird.

**Technik:** SheetJS, Chart.js, jQuery/jQuery-UI, PivotTable.js via CDN;
Vanilla-JS im Namespace-Muster; eigenes CSS mit Variablen; kein Framework.
Dokumentiere Start und Datenpflege in einer `README.md`.
