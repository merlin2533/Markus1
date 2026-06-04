# Kreditprotokoll (HTML)

Flexible HTML-Lösung, die das Excel-Kreditprotokoll
(*Markt einschließlich Finanzierung / Kompakt*) 1:1 abbildet – inkl.
varianten­abhängiger Fragen, Pflicht-Begründungen, automatisch
zusammengesetzter Ausgabe, Speichern/Laden als JSON und druckfertiger
PDF-Ansicht.

## Schnellstart

Wegen des `fetch` der Datendatei muss die Seite über einen kleinen
Webserver geöffnet werden (nicht per Doppelklick):

```bash
cd Protokoll
python3 -m http.server 8000
# Browser: http://localhost:8000
```

## Bedienung

1. **Auswahl & Stammdaten** – Neu-/Bestandskunde, Kundenart und
   Finanzierung wählen. Daraus wird automatisch die **Variante (1–16)**
   bestimmt; es werden nur die für diese Variante relevanten Fragen
   angezeigt (genau wie in Excel). Bei `Finanzierung = Kompakt` erscheint
   ausschließlich der Kompakt-Fragebogen.
2. **Fragen** – je Reiter (Person, Vorhaben, …) die Antworten auswählen.
   Antwortoptionen mit *„Bitte kommentieren / eintragen"* erzeugen ein
   **Pflichtfeld „Begründung"**. Offene Pflichtfelder werden oben in der
   Ausgabe gelistet. Am Ende jedes Reiters führt ein **„Weiter →"**-Button
   zum nächsten Reiter (auf dem letzten: „✓ Fertig – zur Ausgabe").
3. **Protokoll-Ausgabe** – **reiterweise** ausgegeben: jeder Abschnitt hat
   einen eigenen **„Kopieren"**-Button, damit der Text einzeln in eine
   andere Anwendung eingefügt werden kann. Der Text wird live aus den
   Original-Wortlauten der Vorlage zusammengesetzt; Begründungen werden an
   der Platzhalterstelle (`…`) eingefügt. Mit *„bearbeitbar"* lassen sich
   verbleibende Platzhalter (`[Datum]`, `[ … ]`, …) noch füllen.
   - **Zeichenanzahl je Reiter** wird angezeigt (`1234 / 2000 Zeichen`)
     inkl. Fortschrittsbalken; bei Überschreitung rot mit „… zu viel".
   - **Auto-Aufteilung am Limit**: Ist ein Abschnitt länger als das Limit,
     wird er automatisch in **N Teile** (jeweils ≤ Limit) zerlegt – jeder
     Teil einzeln kopierbar (Teil 1/3, 2/3, …).
4. **Speichern / Laden** – sichert bzw. lädt den kompletten Datensatz als
   JSON. (Zusätzlich wird der Stand automatisch im Browser gehalten.)
5. **Drucken / PDF** – öffnet den Druckdialog mit einer sauber
   formatierten Dokumentansicht (A4). Über „Als PDF speichern" entsteht
   ein PDF.

### Tastatursteuerung

| Taste | Funktion |
|-------|----------|
| `Alt + →` / `Alt + ←` | nächster / vorheriger Reiter |
| `Alt + ↓` / `Alt + ↑` | nächste / vorherige Frage |
| `Enter` (im Auswahlfeld) | weiter zur nächsten Frage (bzw. ins Begründungsfeld) |
| `Strg + Enter` (im Begründungsfeld) | weiter zur nächsten Frage |
| `Alt + C` | aktuellen Reiter-Abschnitt kopieren |
| `Alt + P` | Drucken / PDF |

Nach Auswahl einer Antwort springt der Fokus automatisch weiter – bei
kommentarpflichtigen Antworten direkt ins Begründungsfeld.

### Zeichen-Limits konfigurieren (`config.json`)

```jsonc
{
  "zeichenLimits": {
    "default": 2000,        // gilt fuer alle nicht einzeln genannten Abschnitte
    "person": 2000,
    "kompakt": 4000
    // Wert 0 / weglassen = kein Limit
  },
  "warnAbProzent": 90       // ab diesem Fuellgrad faerbt sich der Zaehler (Vorwarnung)
}
```

Die Schlüssel entsprechen den Abschnitts-IDs: `person`, `vorhaben`,
`entwicklung`, `liquiditaet`, `rating`, `sicherheit`, `votum`,
`entscheidung`, `kompakt`. Fehlt die Datei, gilt überall 2000 Zeichen.

## Dateien

| Datei | Zweck |
|-------|-------|
| `index.html`, `styles.css`, `js/app.js` | Die Anwendung |
| `config.json` | Zeichen-Limits je Reiter + Warnschwelle |
| `data/protocol-data.json` | Vollständiges Datenmodell (aus der Excel-Vorlage erzeugt) |
| `beispiel-export.json` | Beispiel eines Datensatzes (Speicherformat) |
| `referenz-antwortoptionen.json` | Alle Fragen + gültige Antwort-Labels (Nachschlagewerk / für KI) |

## Speicherformat (JSON)

```jsonc
{
  "schemaVersion": 1,
  "typ": "Kreditprotokoll",
  "cover":   { "kundeTyp": "NeuKunde", "kundenart": "sHB", "finanzierung": "BauFi" },
  "kopf":    { "kreditnehmer": "", "stammnummer": "", "datum": "", "berater": "", "obligo": "" },
  "antworten": {
    "1.2": { "auswahl": "Trifft zu" },
    "1.8": { "auswahl": "Trifft eingeschränkt zu - Bitte kommentieren",
             "begruendung": "…" }
  }
}
```

* **`cover`** – steuert die Variante. Erlaubte Werte:
  `kundeTyp` = `BestandsKunde|NeuKunde`, `kundenart` = `aHB|sHB`,
  `finanzierung` = `BauFi|Exi|SoFi|Kompakt`.
* **`antworten`** – Schlüssel ist die Fragenummer (z. B. `1.2`, `K.5`),
  `auswahl` ist der **exakte Antwort-Label-Text**. `begruendung` nur, wenn
  die Antwort kommentarpflichtig ist.

### Datensatz aus Freitext von einer KI erzeugen lassen

`beispiel-export.json` und `referenz-antwortoptionen.json` einer KI
mitgeben und etwa so anweisen:

> Erzeuge eine JSON-Datei **exakt** im Format von `beispiel-export.json`.
> Verwende als Fragenummern und als `auswahl`-Werte ausschließlich die in
> `referenz-antwortoptionen.json` aufgeführten Labels (Feld `label`).
> Setze `begruendung` nur, wenn die gewählte Option
> `begruendungPflicht: true` hat. Wähle die Antworten anhand des
> folgenden Textes: «… Falltext …». Gib nur das JSON aus.

### Robuster Import

Der Import übernimmt **nur Elemente, die zur internen Struktur passen** –
alles andere wird ignoriert (es entstehen keine Fehler):

* `cover`-Werte nur, wenn sie in der erlaubten Liste stehen
  (Groß-/Kleinschreibung egal).
* `kopf` nur bekannte Felder, nur Strings.
* `antworten` nur für **existierende Fragenummern**; die `auswahl` muss zu
  einer gültigen Antwort der Frage passen (exakt → getrimmt/ohne
  Groß-/Kleinschreibung → Präfix). Unpassende Einträge werden gezählt und
  übersprungen.
* `begruendung` wird nur übernommen, wenn die Antwort tatsächlich
  kommentarpflichtig ist.

Nach dem Laden meldet die App, wie viele Antworten übernommen bzw.
ignoriert wurden.

## Aktualisierung der Vorlage

`data/protocol-data.json` wurde aus der Excel-Datei (Reiter **Vorlage**)
generiert: Fragen, Antwortoptionen, Ausgabe-Wortlaute (*Answer Text*),
Hinweise und die Varianten-Markierungen (Matrix der 16 Kombinationen).
Bei einer neuen Excel-Version muss diese Datei neu erzeugt werden.
