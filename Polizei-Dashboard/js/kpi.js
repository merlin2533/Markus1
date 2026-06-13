/* kpi.js – Registry aller Kennzahlen + Berechnungen.
   Eine KPI verweist auf eine Spalte in der Zeitreihe (key) und auf eine
   additive Messgröße in den Fakten (faktKey) für Aufschlüsselungen. */
(function (POL) {
  'use strict';

  // richtung: 'hoch' = höher besser, 'niedrig' = niedriger besser, 'neutral' = nah am Ziel
  function k(o) { return o; }

  POL.KPIS = {
    personal: [
      k({ id: 'personalstand', key: 'Personalstand', label: 'Personalstand', unit: 'MA', fmt: 'integer', decimals: 0, faktKey: 'Personalstand', dims: ['Abteilung', 'Beamtenstatus', 'Laufbahngruppe', 'Geschlecht', 'Altersgruppe'], beschreibung: 'Beschäftigte gesamt (Köpfe) im Präsidium Technik.' }),
      k({ id: 'krankenstand', key: 'Krankenstandquote', label: 'Krankenstandquote', unit: '%', fmt: 'percent', decimals: 2, faktKey: 'Krankheitstage', dims: ['Abteilung', 'Altersgruppe', 'Beamtenstatus'], beschreibung: 'Krankheitstage im Verhältnis zu Soll-Arbeitstagen × Personalstand.' }),
      k({ id: 'krankheitstage', key: 'Krankheitstage', label: 'Krankheitstage', unit: 'Tage', fmt: 'integer', decimals: 0, faktKey: 'Krankheitstage', dims: ['Abteilung', 'Altersgruppe', 'Beamtenstatus', 'Geschlecht'], beschreibung: 'Summe der Krankheitstage im Monat (alle Beschäftigten).' }),
      k({ id: 'urlaubstage', key: 'Urlaubstage', label: 'Genommene Urlaubstage', unit: 'Tage', fmt: 'integer', decimals: 0, faktKey: 'Urlaubstage', dims: ['Abteilung', 'Beamtenstatus', 'Geschlecht'], beschreibung: 'Im Monat genommene Urlaubstage gesamt.' }),
      k({ id: 'resturlaub', key: 'Resturlaub', label: 'Ø Resturlaub', unit: 'Tage', fmt: 'decimal', decimals: 1, faktKey: 'Urlaubstage', dims: ['Abteilung'], beschreibung: 'Durchschnittlicher Resturlaub je Beschäftigtem.' }),
      k({ id: 'ueberstunden', key: 'Ueberstunden', label: 'Mehrdienst-/Überstunden', unit: 'Std', fmt: 'integer', decimals: 0, faktKey: 'Ueberstunden', dims: ['Abteilung', 'Laufbahngruppe', 'Beamtenstatus'], beschreibung: 'Summe der Mehrdienststunden im Monat.' }),
      k({ id: 'fluktuation', key: 'Fluktuationsquote', label: 'Fluktuationsquote', unit: '%', fmt: 'percent', decimals: 2, faktKey: 'Abgaenge', dims: ['Abteilung', 'Altersgruppe'], beschreibung: 'Abgänge im Verhältnis zum Personalstand (monatlich).' }),
      k({ id: 'durchschnittsalter', key: 'Durchschnittsalter', label: 'Durchschnittsalter', unit: 'Jahre', fmt: 'decimal', decimals: 1, faktKey: 'Personalstand', dims: ['Abteilung', 'Beamtenstatus'], beschreibung: 'Mengengewichtetes Durchschnittsalter.' }),
      k({ id: 'teilzeitquote', key: 'Teilzeitquote', label: 'Teilzeitquote', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Teilzeit', dims: ['Abteilung', 'Geschlecht'], beschreibung: 'Anteil Teilzeitbeschäftigter.' }),
      k({ id: 'frauenanteil', key: 'Frauenanteil', label: 'Frauenanteil', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Personalstand', dims: ['Geschlecht', 'Abteilung', 'Laufbahngruppe'], beschreibung: 'Anteil weiblicher Beschäftigter.' }),
    ],
    finanzen: [
      k({ id: 'gesamtkosten', key: 'Gesamtkosten', label: 'Gesamtkosten (Monat)', unit: '€', fmt: 'currency', faktKey: 'Betrag', dims: ['Abteilung', 'Kostenart'], beschreibung: 'Summe aller Kostenarten im Monat.' }),
      k({ id: 'budget', key: 'BudgetausschoepfungYTD', label: 'Budgetausschöpfung (YTD)', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Betrag', dims: ['Abteilung', 'Kostenart'], beschreibung: 'Aufgelaufene Ist-Kosten im Verhältnis zum anteiligen Jahresbudget.' }),
      k({ id: 'personalkosten', key: 'Personalkosten', label: 'Personalkosten', unit: '€', fmt: 'currency', faktKey: 'Betrag', faktFilter: { Kostenart: 'Personalkosten' }, dims: ['Abteilung'], beschreibung: 'Personalkosten im Monat.' }),
      k({ id: 'sachkosten', key: 'Sachkosten', label: 'Sachkosten', unit: '€', fmt: 'currency', faktKey: 'Betrag', faktFilter: { Kostenart: 'Sachkosten' }, dims: ['Abteilung'], beschreibung: 'Sachkosten im Monat.' }),
      k({ id: 'ueberstundenkosten', key: 'Ueberstundenkosten', label: 'Überstundenkosten', unit: '€', fmt: 'currency', faktKey: 'Betrag', faktFilter: { Kostenart: 'Überstundenkosten' }, dims: ['Abteilung'], beschreibung: 'Kosten für Mehrdienst/Überstunden.' }),
      k({ id: 'investitionen', key: 'Investitionen', label: 'Investitionen', unit: '€', fmt: 'currency', faktKey: 'Betrag', faktFilter: { Kostenart: 'Investitionen' }, dims: ['Abteilung'], beschreibung: 'Investitionsausgaben im Monat.' }),
      k({ id: 'kostenprokopf', key: 'KostenProKopf', label: 'Kosten pro Kopf', unit: '€', fmt: 'currencyFull', faktKey: 'Betrag', dims: ['Abteilung', 'Kostenart'], beschreibung: 'Gesamtkosten je Beschäftigtem im Monat.' }),
    ],
    fuhrpark: [
      k({ id: 'bestand', key: 'Fahrzeugbestand', label: 'Fahrzeugbestand', unit: 'Fz', fmt: 'integer', decimals: 0, faktKey: 'Bestand', dims: ['Fahrzeugklasse', 'Abteilung'], beschreibung: 'Anzahl Fahrzeuge im Bestand.' }),
      k({ id: 'verfuegbarkeit', key: 'Verfuegbarkeitsquote', label: 'Verfügbarkeitsquote', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Verfuegbar', dims: ['Fahrzeugklasse', 'Abteilung'], beschreibung: 'Anteil einsatzbereiter Fahrzeuge.' }),
      k({ id: 'werkstatt', key: 'Werkstattkosten', label: 'Werkstatt-/Reparaturkosten', unit: '€', fmt: 'currency', faktKey: 'Werkstattkosten', dims: ['Fahrzeugklasse', 'Abteilung'], beschreibung: 'Werkstatt- und Reparaturkosten im Monat.' }),
      k({ id: 'kmleistung', key: 'KMLeistung', label: 'km-Leistung', unit: 'km', fmt: 'integer', decimals: 0, faktKey: 'KM', dims: ['Fahrzeugklasse', 'Abteilung'], beschreibung: 'Gefahrene Kilometer im Monat.' }),
      k({ id: 'flottenalter', key: 'FlottenalterDurchschnitt', label: 'Ø Flottenalter', unit: 'Jahre', fmt: 'decimal', decimals: 1, faktKey: 'Bestand', dims: ['Fahrzeugklasse'], beschreibung: 'Durchschnittliches Alter der Flotte.' }),
      k({ id: 'ausstattung', key: 'Ausstattungsquote', label: 'Ausstattungsquote', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Bestand', dims: ['Fahrzeugklasse'], beschreibung: 'Erfüllungsgrad der Soll-Ausstattung (Schutz/Technik).' }),
    ],
    einsatz: [
      k({ id: 'einsatzstunden', key: 'Einsatzstunden', label: 'Einsatz-/Unterstützungsstunden', unit: 'Std', fmt: 'integer', decimals: 0, faktKey: 'Stunden', dims: ['Einsatzart', 'Abteilung'], beschreibung: 'Geleistete technische Einsatz-/Unterstützungsstunden.' }),
      k({ id: 'einsaetze', key: 'Einsaetze', label: 'Einsätze / Vorgänge', unit: '', fmt: 'integer', decimals: 0, faktKey: 'Anzahl', dims: ['Einsatzart', 'Abteilung'], beschreibung: 'Anzahl technischer Einsätze und Vorgänge.' }),
      k({ id: 'schulungstage', key: 'Schulungstage', label: 'Schulungstage', unit: 'Tage', fmt: 'integer', decimals: 0, faktKey: 'Schulungstage', dims: ['Abteilung', 'Einsatzart'], beschreibung: 'Durchgeführte Schulungs-/Fortbildungstage.' }),
      k({ id: 'fortbildung', key: 'Fortbildungsquote', label: 'Fortbildungsquote', unit: '%', fmt: 'percent', decimals: 1, faktKey: 'Teilnehmer', dims: ['Abteilung'], beschreibung: 'Fortbildungsteilnehmer im Verhältnis zum Personalstand.' }),
      k({ id: 'anwaerter', key: 'Anwaerter', label: 'Anwärter / Auszubildende', unit: '', fmt: 'integer', decimals: 0, faktKey: 'Anzahl', dims: ['Abteilung'], beschreibung: 'Aktuell in Ausbildung befindliche Personen.' }),
    ],
  };

  // Flache Liste + Lookup
  POL.allKpis = function () {
    var out = [];
    Object.keys(POL.KPIS).forEach(function (b) {
      POL.KPIS[b].forEach(function (kp) { out.push(Object.assign({ bereich: b }, kp)); });
    });
    return out;
  };
  POL.kpi = function (bereich, id) {
    var list = POL.KPIS[bereich] || [];
    var f = list.filter(function (x) { return x.id === id; })[0];
    return f ? Object.assign({ bereich: bereich }, f) : null;
  };

  /* ---- Zugriff auf Zeitreihe ---- */
  function zr(bereich) { return POL.data.bereiche[bereich].zeitreihe; }

  POL.series = function (kpi) {
    return zr(kpi.bereich).map(function (row) {
      return { monat: row.Monat, value: Number(row[kpi.key]) };
    });
  };
  POL.current = function (kpi) { var s = POL.series(kpi); return s[s.length - 1]; };
  POL.previous = function (kpi) { var s = POL.series(kpi); return s[s.length - 2]; };
  POL.yoy = function (kpi) { var s = POL.series(kpi); return s.length >= 13 ? s[s.length - 13] : null; };

  // Δ zum Vormonat (absolut + %); "gut" abhängig von Richtung
  POL.delta = function (kpi) {
    var c = POL.current(kpi), p = POL.previous(kpi);
    if (!c || !p) return null;
    var abs = c.value - p.value;
    var pct = p.value ? (abs / Math.abs(p.value)) * 100 : 0;
    var richtung = (POL.ziel(kpi) || {}).Richtung || 'neutral';
    var gut = richtung === 'niedrig' ? abs < 0 : richtung === 'hoch' ? abs > 0 : null;
    return { abs: abs, pct: pct, gut: gut, richtung: richtung };
  };

  // YTD-Aggregat (Summe additiver Größen, sonst Mittelwert) für laufendes Kalenderjahr
  POL.ytd = function (kpi) {
    var s = POL.series(kpi);
    var jahr = s[s.length - 1].monat.split('-')[0];
    var rows = s.filter(function (r) { return r.monat.split('-')[0] === jahr; });
    var additiv = ['integer'].indexOf(kpi.fmt) >= 0 && kpi.unit !== 'Jahre' && kpi.id !== 'bestand' && kpi.id !== 'anwaerter';
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    return { sum: sum, avg: sum / rows.length, additiv: additiv, monate: rows.length };
  };

  /* ---- Ziele & Ampel ---- */
  POL.ziel = function (kpi) {
    var list = POL.data.bereiche[kpi.bereich].ziele || [];
    return list.filter(function (z) { return z.Kennzahl === kpi.key; })[0] || null;
  };

  // Ampel: 'gruen' | 'gelb' | 'rot' (oder 'neutral' ohne Ziel)
  POL.ampel = function (kpi, value) {
    var z = POL.ziel(kpi);
    if (!z) return 'neutral';
    if (value == null) value = POL.current(kpi).value;
    var ziel = Number(z.Zielwert), tol = Number(z.Toleranz) / 100;
    if (z.Richtung === 'hoch') {
      if (value >= ziel) return 'gruen';
      if (value >= ziel * (1 - tol)) return 'gelb';
      return 'rot';
    }
    if (z.Richtung === 'niedrig') {
      if (value <= ziel) return 'gruen';
      if (value <= ziel * (1 + tol)) return 'gelb';
      return 'rot';
    }
    // neutral
    var dev = Math.abs(value - ziel) / (Math.abs(ziel) || 1);
    if (dev <= tol) return 'gruen';
    if (dev <= tol * 2) return 'gelb';
    return 'rot';
  };

  POL.AMPEL_LABEL = { gruen: 'im Plan', gelb: 'Beobachtung', rot: 'kritisch', neutral: '–' };

  // einfache lineare Hochrechnung auf Jahresende (für Prognosen)
  POL.forecastYearEnd = function (kpi) {
    var s = POL.series(kpi);
    var jahr = s[s.length - 1].monat.split('-')[0];
    var rows = s.filter(function (r) { return r.monat.split('-')[0] === jahr; });
    if (!rows.length) return null;
    var n = rows.length;
    // lineare Regression über Monatsindex
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    rows.forEach(function (r, i) { sx += i; sy += r.value; sxy += i * r.value; sxx += i * i; });
    var slope = (n * sxy - sx * sy) / Math.max(1, (n * sxx - sx * sx));
    var intercept = (sy - slope * sx) / n;
    return { atDec: intercept + slope * 11, slope: slope, monateBekannt: n };
  };

  /* ---- Aufschlüsselung aus Fakten ---- */
  POL.dimColumn = function (kpi, dim) { return dim; };

  POL.breakdown = function (kpi, monat, dim) {
    var fakten = POL.data.bereiche[kpi.bereich].fakten;
    var map = {};
    for (var i = 0; i < fakten.length; i++) {
      var row = fakten[i];
      if (row.Monat !== monat) continue;
      if (kpi.faktFilter) {
        var ok = true;
        for (var fk in kpi.faktFilter) { if (row[fk] !== kpi.faktFilter[fk]) { ok = false; break; } }
        if (!ok) continue;
      }
      var label = row[dim];
      map[label] = (map[label] || 0) + (Number(row[kpi.faktKey]) || 0);
    }
    var arr = Object.keys(map).map(function (key) { return { label: key, value: map[key] }; });
    arr.sort(function (a, b) { return b.value - a.value; });
    return arr;
  };

})(window.POL);
