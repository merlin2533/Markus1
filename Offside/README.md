# Offside · Interaktiver Kommunikationsplan (Behörde)

Eine **reine Web-Anwendung** (HTML/CSS/JavaScript, ohne Server, ohne Build) zum
Aufbau, Pflegen und Visualisieren eines **Kommunikationsplans** – am Beispiel
einer Behörde (Polizeipräsidium, DEMO-Daten). Farbwelt in **Polizei-Blau**.

> **Start:** `Offside/index.html` einfach im Browser öffnen. Läuft komplett
> offline – die Excel-Bibliothek (SheetJS) ist lokal unter `vendor/` eingebunden.

---

## Funktionen

### Mehrere Pläne verwalten
Oben links lassen sich **beliebig viele Pläne** anlegen, **duplizieren**,
**umbenennen** und **löschen** und per Dropdown umschalten – jeder Plan wird
einzeln gespeichert. So können mehrere Kommunikationspläne parallel gepflegt werden.

### Interaktives Chart (Canvas-Board)
- **Verschieben** der Elemente per Drag & Drop (Maus **und Touch/Tablet**)
- **Hinzufügen** neuer Kommunikations-Elemente (`＋ Element`)
- **Löschen** über das Detail-Panel oder Taste **Entf**
- **Verbinden** zweier Elemente (Modus *Verbinden* → zwei Karten anklicken);
  Pfeile zeigen den Kommunikationsfluss, **Labels** je Verbindung editierbar
- **Auswählen** per Klick → Bearbeitung im Detail-Panel rechts; **Esc** hebt auf
- **Zoom** (`＋ / − / Fit`, Strg+Mausrad) und **Undo/Redo** (`↶ ↷`, Strg+Z / Strg+Y)
- **Auto-Layout / Swimlanes**: Karten automatisch in Bahnen nach **Hierarchie**
  oder **Person/Thema** anordnen
- **Suchen & Filtern** nach Text, Aktionsart, Medium, Hierarchie-Ebene und
  Person/Thema (nicht passende Karten werden ausgegraut)

### Zuordnung pro Element
Jedes Element ist genau **einer Person oder einem Themengebiet** zugeordnet
(umschaltbar 👤 Person / 🏷️ Themengebiet).

### Aktionsarten (welche Aktionen sind notwendig?)
| Kürzel | Aktion | Bedeutung |
|--------|--------|-----------|
| INFO  | Informieren  | Einseitige Weitergabe (Lagebild, Bekanntmachung) |
| ABST  | Abstimmen    | Gemeinsame Konsensfindung |
| BER   | Berichten    | Strukturierte Rückmeldung nach oben |
| ESK   | Eskalieren   | Hochstufung an die nächsthöhere Ebene |
| AUFT  | Beauftragen  | Verbindliche Weisung mit Termin |
| FREI  | Freigeben    | Formale Genehmigung / Freigabe |
| BERAT | Beraten      | Fachliche Empfehlung ohne Entscheidungsbefugnis |
| KONS  | Konsultieren | Aktives Einholen einer Stellungnahme |

### Medium / Kanal pro Element
Über welches Medium wird kommuniziert – jeweils mit Icon auf der Karte:
🗣️ Besprechung · 💬 Chat · ✉️ E-Mail · 📁 Akte · 📄 Bericht · 📝 Vermerk ·
📞 Telefon · 📻 Funk/DISPO · 🎫 Ticketsystem · 🎥 Videokonferenz ·
🌐 Intranet · 📢 Pressemeldung

### Teilnehmer-Pflege
Eigener Reiter zum Anlegen/Löschen von **Personen** und **Themengebieten**
inkl. Organisationseinheit, Hierarchie-Ebene und Kontakt. Diese stehen in den
Elementen als Zuordnung und als Mehrfach-Teilnehmer zur Verfügung.

### Teilnehmer- & Hierarchie-Pflege (bearbeitbar)
Teilnehmer (Personen/Themengebiete) und Hierarchie-Ebenen lassen sich anlegen,
**bearbeiten (✎)** und löschen. **Referenzielle Integrität**: Wird ein Teilnehmer
oder eine Ebene umbenannt, werden alle Verweise in den Elementen automatisch
mitgeführt; beim Löschen bleiben keine „toten" Verweise zurück.

### Hierarchie pro Element
Jeder Ebene ist ein **Rang** zugeordnet (1 = oben); die Ebene ist **pro Element
zuordenbar**, um den Plan besser zu steuern (z. B. Eskalationsrichtung).

### Auswertung
Eigener Reiter mit **Statistik** (Anzahl je Aktionsart, Medium, Hierarchie als
Balken) und einer **Beteiligungs-Matrix** (Teilnehmer × Aktionsart) für einen
RACI-artigen Überblick.

### Plan-Eigenschaften
Reiter *Plan*: Plan-Name sowie **Meta-Kopf** (Titel, Behörde, Stand, Ersteller)
sind frei editierbar.

### Export & Import
- **⬇ Excel** – exportiert den kompletten Plan als `.xlsx` mit den Blättern
  *Elemente, Verbindungen, Teilnehmer, Hierarchie, Meta, Legende*.
  Die Datei ist in Excel **bearbeitbar** und wieder importierbar.
- **⬆ Excel importieren** – liest eine bearbeitete `.xlsx` wieder ein.
- **🖼 Bild (PNG)** – exportiert das Chart als PNG (mit DEMO-Wasserzeichen).
- **🖨 Drucken/PDF** – druckoptimierte Ansicht (Browser-Druck → „Als PDF speichern").

### Persistenz
Alle Änderungen werden automatisch im **localStorage** des Browsers gespeichert.
`↺ DEMO zurücksetzen` stellt die Beispieldaten wieder her.

---

## Projektstruktur
```
Offside/
├── index.html          # Einstiegspunkt
├── styles.css          # Polizei-Blau Design
├── print.css           # Druck-/PDF-Layout
├── vendor/
│   └── xlsx.full.min.js # SheetJS (lokal, offline)
└── js/
    ├── data.js         # Stammdaten, Aktionsarten, Medien, DEMO-Daten
    ├── state.js        # Multi-Plan-Zustand, localStorage, Integrität, Undo/Redo
    ├── chart.js        # interaktives SVG-Board (Drag/Touch/Zoom/Filter/Swimlanes)
    ├── excel.js        # Excel Export/Import
    ├── image.js        # PNG-Export
    └── app.js          # UI-Steuerung (Pläne, Pflege, Auswertung, Filter)
```

## DEMO-Daten
Fiktives „Polizeipräsidium München" mit 9 Kommunikations-Elementen, 8
Verbindungen, 12 Teilnehmern/Themengebieten und 5 Hierarchie-Ebenen.
Alle Daten sind als **DEMO** gekennzeichnet (Flag oben rechts, Wasserzeichen im Bild).
