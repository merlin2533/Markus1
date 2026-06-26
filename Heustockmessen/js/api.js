/**
 * Api – dünner fetch-Client für api.php.
 * Alle Methoden liefern Promises; bei Fehler wird geworfen (Error mit Text).
 * Hält das CSRF-Token (aus login/status) und sendet es bei POST automatisch mit.
 */
const Api = (() => {
  const ENDPUNKT = 'api.php';
  let csrf = null;

  async function ruf(action, body, methode = 'GET') {
    const opt = { method: methode, headers: {} };
    const url = `${ENDPUNKT}?action=${encodeURIComponent(action)}`;
    if (methode === 'POST') {
      opt.headers['Content-Type'] = 'application/json';
      if (csrf) opt.headers['X-CSRF-Token'] = csrf;
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
    if (daten && daten.csrf) csrf = daten.csrf;   // Token aktuell halten
    if (!res.ok || !daten || daten.ok === false) {
      const err = new Error((daten && daten.error) || ('HTTP ' + res.status));
      err.status = res.status;
      throw err;
    }
    return daten;
  }

  return {
    setCsrf:         (t)     => { csrf = t; },
    hatCsrf:         ()      => !!csrf,

    ping:            ()      => ruf('ping'),
    status:          ()      => ruf('status'),
    login:           (passwort) => ruf('login', { passwort }, 'POST'),
    logout:          ()      => ruf('logout', {}, 'POST'),
    passwortAendern: (alt, neu) => ruf('passwort_aendern', { alt, neu }, 'POST'),

    stand:           ()      => ruf('stand'),
    alles:           ()      => ruf('alles'),
    stammdaten:      ()      => ruf('stammdaten'),
    messreihen:      ()      => ruf('messreihen'),

    messstelleSave:  (d)     => ruf('messstelle_save', d, 'POST'),
    messstelleDelete:(id)    => ruf('messstelle_delete', { id }, 'POST'),
    messstelleDuplizieren: (id) => ruf('messstelle_duplizieren', { id }, 'POST'),
    schwellenSet:    (d)     => ruf('schwellen_set', d, 'POST'),

    halleSave:       (d)     => ruf('halle_save', d, 'POST'),
    halleDelete:     (id)    => ruf('halle_delete', { id }, 'POST'),

    ortSave:         (d)     => ruf('ort_save', d, 'POST'),
    ortDelete:       (id)    => ruf('ort_delete', { id }, 'POST'),

    messreiheSave:   (d)     => ruf('messreihe_save', d, 'POST'),
    messreiheDelete: (id)    => ruf('messreihe_delete', { id }, 'POST'),

    restore:         (daten) => ruf('restore', daten, 'POST'),
  };
})();
