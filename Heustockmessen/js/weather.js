/**
 * Wetter – holt die aktuelle Außentemperatur über den Browser-Standort
 * (Geolocation) und die kostenlose Open-Meteo-API (nutzt u. a. DWD-ICON-Daten,
 * kein API-Schlüssel nötig). Erfordert Internet; manuelle Eingabe bleibt immer
 * als Rückfall verfügbar.
 */
const Wetter = (() => {

  function standort() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Standort wird vom Browser nicht unterstützt.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(new Error('Standort nicht verfügbar: ' + err.message)),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });
  }

  async function tempFuer(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
      + '&current=temperature_2m';
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Wetterdienst nicht erreichbar (HTTP ' + res.status + ')');
    }
    const j = await res.json();
    const t = j && j.current && j.current.temperature_2m;
    if (typeof t !== 'number') {
      throw new Error('Keine Temperatur erhalten.');
    }
    return { temperatur: t, einheit: (j.current_units && j.current_units.temperature_2m) || '°C' };
  }

  /** Komplett: Standort holen + Temperatur abrufen. */
  async function aktuelleTemperatur() {
    const { lat, lon } = await standort();
    const { temperatur, einheit } = await tempFuer(lat, lon);
    return {
      temperatur,
      einheit,
      lat,
      lon,
      quelle: 'open-meteo',
      text: `Open-Meteo · ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    };
  }

  return { aktuelleTemperatur, standort, tempFuer };
})();
