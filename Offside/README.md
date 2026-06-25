# Offside · Interaktiver Kommunikationsplan (Behörde)

Eine **reine Web-Anwendung** (HTML/CSS/JavaScript, ohne Server, ohne Build) zum
Aufbau, Pflegen und Visualisieren eines **Kommunikationsplans** – am Beispiel
einer Behörde (Polizeipräsidium, DEMO-Daten). Farbwelt in **Polizei-Blau**.

> **Start:** `Offside/index.html` einfach im Browser öffnen. Läuft komplett
> offline – die Excel-Bibliothek (SheetJS) ist lokal unter `vendor/` eingebunden.

---

## Funktionen

### Interaktives Chart (Canvas-Board)
- **Verschieben** der Elemente per Drag & Drop
- **Hinzufügen** neuer Kommunikations-Elemente (`＋ Element`)
- **Löschen** über das Detail-Panel
- **Verbinden** zweier Elemente (Modus *Verbinden* → zwei Karten anklicken);
  Pfeile zeigen den Kommunikationsfluss
- **Auswählen** per Klick → Bearbeitung im Detail-Panel rechts

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

### Hierarchie-Pflege
Eigener Reiter für die **Hierarchie-Ebenen** (Rang 1 = oben). Jeder Ebene ist
ein Rang zugeordnet; die Ebene ist **pro Element zuordenbar**, um den Plan besser
zu steuern (z. B. Eskalationsrichtung).

### Export & Import
- **⬇ Excel** – exportiert den kompletten Plan als `.xlsx` mit den Blättern
  *Elemente, Verbindungen, Teilnehmer, Hierarchie, Meta, Legende*.
  Die Datei ist in Excel **bearbeitbar** und wieder importierbar.
- **⬆ Excel importieren** – liest eine bearbeitete `.xlsx` wieder ein.
- **🖼 Bild (PNG)** – exportiert das Chart als PNG (mit DEMO-Wasserzeichen).

### Persistenz
Alle Änderungen werden automatisch im **localStorage** des Browsers gespeichert.
`↺ DEMO zurücksetzen` stellt die Beispieldaten wieder her.

---

## Projektstruktur
```
Offside/
├── index.html          # Einstiegspunkt
├── styles.css          # Polizei-Blau Design
├── vendor/
│   └── xlsx.full.min.js # SheetJS (lokal, offline)
└── js/
    ├── data.js         # Stammdaten, Aktionsarten, Medien, DEMO-Daten
    ├── state.js        # Zustand + localStorage
    ├── chart.js        # interaktives SVG-Board (Drag/Connect)
    ├── excel.js        # Excel Export/Import
    ├── image.js        # PNG-Export
    └── app.js          # UI-Steuerung
```

## DEMO-Daten
Fiktives „Polizeipräsidium München" mit 9 Kommunikations-Elementen, 8
Verbindungen, 12 Teilnehmern/Themengebieten und 5 Hierarchie-Ebenen.
Alle Daten sind als **DEMO** gekennzeichnet (Flag oben rechts, Wasserzeichen im Bild).
