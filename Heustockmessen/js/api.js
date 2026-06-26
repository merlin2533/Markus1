/**
 * Api – dünner fetch-Client für api.php.
 * Alle Methoden liefern Promises; bei Fehler wird geworfen (Error mit Text).
 */
const Api = (() => {
  const ENDPUNKT = 'api.php';

  async function ruf(action, body, methode = 'GET') {
    const opt = { method: methode, headers: {} };
    let url = `${ENDPUNKT}?action=${encodeURIComponent(action)}`;
    if (methode === 'POST') {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify({ action, ...(body || {}) });
    }
    let res;
    try {
      res = await fetch(url, opt);
    } catch (e) {
      throw new Error('Server nicht erreichbar (' + e.message + ')');
    }
    let daten;
    try {
      daten = await res.json();
    } catch (e) {
      throw new Error('Ungültige Server-Antwort (Status ' + res.status + ')');
    }
    if (!res.ok || !daten || daten.ok === false) {
      throw new Error((daten && daten.error) || ('HTTP ' + res.status));
    }
    return daten;
  }

  return {
    ping:            ()      => ruf('ping'),
    status:          ()      => ruf('status'),
    login:           (passwort) => ruf('login', { passwort }, 'POST'),
    logout:          ()      => ruf('logout', {}, 'POST'),
    passwortAendern: (alt, neu) => ruf('passwort_aendern', { alt, neu }, 'POST'),
    alles:           ()      => ruf('alles'),
    stammdaten:      ()      => ruf('stammdaten'),
    messreihen:      ()      => ruf('messreihen'),

    messstelleSave:  (d)     => ruf('messstelle_save', d, 'POST'),
    messstelleDelete:(id)    => ruf('messstelle_delete', { id }, 'POST'),

    halleSave:       (d)     => ruf('halle_save', d, 'POST'),
    halleDelete:     (id)    => ruf('halle_delete', { id }, 'POST'),

    ortSave:         (d)     => ruf('ort_save', d, 'POST'),
    ortDelete:       (id)    => ruf('ort_delete', { id }, 'POST'),

    messreiheSave:   (d)     => ruf('messreihe_save', d, 'POST'),
    messreiheDelete: (id)    => ruf('messreihe_delete', { id }, 'POST'),
  };
})();
