<?php
/**
 * Heustockmessen – minimales JSON-API über SQLite (PDO).
 *
 * Eine einzige Datei, keine externen Abhängigkeiten. Die Datenbank wird beim
 * ersten Aufruf automatisch unter data/heustock.sqlite angelegt. So können
 * mehrere Personen über denselben Server auf denselben Datenbestand zugreifen.
 *
 * Hierarchie der Stammdaten:  Messstelle → Halle → Ort.
 * Eine Messreihe ist ein Messbesuch an EINER Messstelle; pro Ort ein Messwert.
 *
 * Antwort immer JSON: { ok: true, ... } oder { ok: false, error: "..." }.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Sitzung für den (gemeinsamen) Passwortschutz.
session_name('heustock_sid');
session_start();

// Standard-Passwort bei Erstinstallation. Wird beim ersten Start gehasht in der
// DB hinterlegt und kann danach in der App geändert werden.
const STANDARD_PASSWORT = 'Feuerwehr112!';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function antwort(array $daten, int $code = 200): void {
    http_response_code($code);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fehler(string $text, int $code = 400): void {
    antwort(['ok' => false, 'error' => $text], $code);
}

function eingabe(): array {
    $roh = file_get_contents('php://input');
    if ($roh !== '' && $roh !== false) {
        $json = json_decode($roh, true);
        if (is_array($json)) {
            return $json + $_GET;
        }
    }
    return $_POST + $_GET;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $verzeichnis = __DIR__ . '/data';
    if (!is_dir($verzeichnis)) {
        @mkdir($verzeichnis, 0775, true);
    }
    $pfad = $verzeichnis . '/heustock.sqlite';
    try {
        $pdo = new PDO('sqlite:' . $pfad);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
    } catch (Throwable $e) {
        fehler('Datenbank nicht erreichbar: ' . $e->getMessage(), 500);
    }
    schemaAnlegen($pdo);
    migriere($pdo);
    return $pdo;
}

function schemaAnlegen(PDO $pdo): void {
    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS messstellen (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            beschreibung TEXT DEFAULT '',
            sortierung   INTEGER DEFAULT 0,
            erstellt_am  TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS hallen (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            messstelle_id INTEGER NOT NULL REFERENCES messstellen(id) ON DELETE CASCADE,
            name          TEXT NOT NULL,
            beschreibung  TEXT DEFAULT '',
            sortierung    INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS orte (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            halle_id    INTEGER NOT NULL REFERENCES hallen(id) ON DELETE CASCADE,
            bezeichnung TEXT NOT NULL,
            sortierung  INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS messreihen (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            messstelle_id    INTEGER REFERENCES messstellen(id) ON DELETE SET NULL,
            zeitpunkt        TEXT NOT NULL,
            aussentemperatur REAL,
            temp_quelle      TEXT DEFAULT 'manuell',
            geo_lat          REAL,
            geo_lon          REAL,
            wetter_text      TEXT DEFAULT '',
            messer           TEXT DEFAULT '',
            notiz            TEXT DEFAULT '',
            foto             TEXT DEFAULT '',
            erstellt_am      TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messwerte (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            messreihe_id INTEGER NOT NULL REFERENCES messreihen(id) ON DELETE CASCADE,
            ort_id       INTEGER NOT NULL REFERENCES orte(id) ON DELETE CASCADE,
            temperatur   REAL,
            tiefe        TEXT DEFAULT '',
            notiz        TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS einstellungen (
            schluessel TEXT PRIMARY KEY,
            wert       TEXT NOT NULL
        );
    SQL);
}

// Spaltennamen einer Tabelle.
function spalten(PDO $pdo, string $tabelle): array {
    $rows = $pdo->query('PRAGMA table_info(' . $tabelle . ')')->fetchAll();
    return array_map(static fn($r) => $r['name'], $rows);
}

function tabelleExistiert(PDO $pdo, string $name): bool {
    $s = $pdo->prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
    $s->execute([$name]);
    return (bool)$s->fetch();
}

/**
 * Migration: hebt alte Datenbanken (2-Ebenen-Modell Messstelle→Ebene, ohne
 * messstelle_id) auf das aktuelle Schema (Messstelle→Halle→Ort) – inkl. Daten.
 * Idempotent: bei bereits aktuellem Schema passiert nichts.
 */
function migriere(PDO $pdo): void {
    // 1. messreihen.messstelle_id ergänzen
    $spR = spalten($pdo, 'messreihen');
    if ($spR && !in_array('messstelle_id', $spR, true)) {
        $pdo->exec('ALTER TABLE messreihen ADD COLUMN messstelle_id INTEGER');
    }

    // Altes Modell erkennen: messwerte.ebene_id ohne ort_id
    $spW = spalten($pdo, 'messwerte');
    $altesModell = $spW && in_array('ebene_id', $spW, true) && !in_array('ort_id', $spW, true);

    // 2. Alte 'ebenen' nach hallen/orte überführen (eine Default-Halle je Messstelle)
    if ($altesModell && tabelleExistiert($pdo, 'ebenen')) {
        $leer = ((int)$pdo->query('SELECT COUNT(*) c FROM orte')->fetch()['c']) === 0;
        if ($leer) {
            $ebenen = $pdo->query('SELECT id, messstelle_id, bezeichnung, sortierung FROM ebenen ORDER BY id')->fetchAll();
            $halleFuer = [];
            $insH = $pdo->prepare("INSERT INTO hallen (messstelle_id, name, beschreibung, sortierung) VALUES (?, 'Halle', '', 0)");
            $insO = $pdo->prepare('INSERT INTO orte (id, halle_id, bezeichnung, sortierung) VALUES (?,?,?,?)');
            foreach ($ebenen as $e) {
                $sid = (int)$e['messstelle_id'];
                if (!isset($halleFuer[$sid])) {
                    $insH->execute([$sid]);
                    $halleFuer[$sid] = (int)$pdo->lastInsertId();
                }
                $insO->execute([(int)$e['id'], $halleFuer[$sid], $e['bezeichnung'], (int)$e['sortierung']]);
            }
        }
    }

    // 3. messwerte auf ort_id umbauen (ort_id = bisheriges ebene_id)
    if ($altesModell) {
        $pdo->exec('PRAGMA foreign_keys = OFF');
        $pdo->exec('CREATE TABLE messwerte_neu (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            messreihe_id INTEGER NOT NULL REFERENCES messreihen(id) ON DELETE CASCADE,
            ort_id       INTEGER NOT NULL REFERENCES orte(id) ON DELETE CASCADE,
            temperatur   REAL,
            tiefe        TEXT DEFAULT \'\',
            notiz        TEXT DEFAULT \'\'
        )');
        $pdo->exec('INSERT INTO messwerte_neu (id, messreihe_id, ort_id, temperatur, notiz)
                    SELECT id, messreihe_id, ebene_id, temperatur, notiz FROM messwerte');
        $pdo->exec('DROP TABLE messwerte');
        $pdo->exec('ALTER TABLE messwerte_neu RENAME TO messwerte');
        $pdo->exec('PRAGMA foreign_keys = ON');
    }

    // 3b. Neue Spalten (Sondentiefe, Foto) bei bestehenden Tabellen ergänzen
    $spW2 = spalten($pdo, 'messwerte');
    if ($spW2 && !in_array('tiefe', $spW2, true)) {
        $pdo->exec("ALTER TABLE messwerte ADD COLUMN tiefe TEXT DEFAULT ''");
    }
    $spR2 = spalten($pdo, 'messreihen');
    if ($spR2 && !in_array('foto', $spR2, true)) {
        $pdo->exec("ALTER TABLE messreihen ADD COLUMN foto TEXT DEFAULT ''");
    }

    // 4. messstelle_id der Reihen aus den Werten herleiten
    $pdo->exec('UPDATE messreihen SET messstelle_id = (
        SELECT h.messstelle_id FROM messwerte w
        JOIN orte o   ON o.id = w.ort_id
        JOIN hallen h ON h.id = o.halle_id
        WHERE w.messreihe_id = messreihen.id LIMIT 1)
      WHERE messstelle_id IS NULL');

    // 5. Indizes (jetzt existieren alle Spalten)
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_hallen_stelle ON hallen(messstelle_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_orte_halle    ON orte(halle_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_reihen_stelle ON messreihen(messstelle_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_werte_reihe   ON messwerte(messreihe_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_werte_ort     ON messwerte(ort_id)');
}

// ---------------------------------------------------------------------------
// Passwortschutz (gemeinsames Passwort, Hash in der DB)
// ---------------------------------------------------------------------------

function passwortHash(PDO $pdo): string {
    $row = $pdo->query("SELECT wert FROM einstellungen WHERE schluessel='passwort_hash'")->fetch();
    if ($row && $row['wert']) {
        return $row['wert'];
    }
    $hash = password_hash(STANDARD_PASSWORT, PASSWORD_DEFAULT);
    $pdo->prepare("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('passwort_hash', ?)")
        ->execute([$hash]);
    return $hash;
}

function holeSchwellen(PDO $pdo): ?array {
    $r = $pdo->query("SELECT wert FROM einstellungen WHERE schluessel='schwellen'")->fetch();
    if (!$r) return null;
    $j = json_decode($r['wert'], true);
    return is_array($j) ? $j : null;
}

function passwortSetzen(PDO $pdo, string $klartext): void {
    $hash = password_hash($klartext, PASSWORD_DEFAULT);
    $pdo->prepare("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('passwort_hash', ?)")
        ->execute([$hash]);
}

function istAngemeldet(): bool {
    return !empty($_SESSION['auth']);
}

function verlangeAuth(): void {
    if (!istAngemeldet()) {
        antwort(['ok' => false, 'error' => 'Nicht angemeldet.', 'auth' => false], 401);
    }
}

// CSRF-Token gegen gefälschte POST-Anfragen (Cookie-Session).
function csrfToken(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}
function verlangeCsrf(array $in): void {
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($in['csrf'] ?? '');
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)$tok)) {
        fehler('Ungültiges oder fehlendes CSRF-Token. Bitte Seite neu laden.', 403);
    }
}

// Revisionszähler – steigt bei jeder Änderung, dient dem Live-Update.
function bumpRev(PDO $pdo): void {
    $pdo->exec("INSERT INTO einstellungen (schluessel, wert) VALUES ('rev', '1')
                ON CONFLICT(schluessel) DO UPDATE SET wert = CAST(wert AS INTEGER) + 1");
}
function holeRev(PDO $pdo): int {
    $r = $pdo->query("SELECT wert FROM einstellungen WHERE schluessel='rev'")->fetch();
    return $r ? (int)$r['wert'] : 0;
}

/** Wert aus Eingabe als float oder null. */
function zahlOderNull($wert): ?float {
    if ($wert === '' || $wert === null) {
        return null;
    }
    return is_numeric($wert) ? (float)$wert : null;
}

// ---------------------------------------------------------------------------
// Stammdaten: Messstellen → Hallen → Orte
// ---------------------------------------------------------------------------

function ladeStammdaten(PDO $pdo): array {
    $stellen = $pdo->query(
        'SELECT id, name, beschreibung, sortierung FROM messstellen ORDER BY sortierung, id'
    )->fetchAll();
    $hallen = $pdo->query(
        'SELECT id, messstelle_id, name, beschreibung, sortierung FROM hallen ORDER BY sortierung, id'
    )->fetchAll();
    $orte = $pdo->query(
        'SELECT id, halle_id, bezeichnung, sortierung FROM orte ORDER BY sortierung, id'
    )->fetchAll();

    $orteNachHalle = [];
    foreach ($orte as $o) {
        $orteNachHalle[(int)$o['halle_id']][] = [
            'id'          => (int)$o['id'],
            'bezeichnung' => $o['bezeichnung'],
            'sortierung'  => (int)$o['sortierung'],
        ];
    }
    $hallenNachStelle = [];
    foreach ($hallen as $h) {
        $hid = (int)$h['id'];
        $hallenNachStelle[(int)$h['messstelle_id']][] = [
            'id'           => $hid,
            'name'         => $h['name'],
            'beschreibung' => $h['beschreibung'],
            'sortierung'   => (int)$h['sortierung'],
            'orte'         => $orteNachHalle[$hid] ?? [],
        ];
    }
    foreach ($stellen as &$s) {
        $s['id']         = (int)$s['id'];
        $s['sortierung'] = (int)$s['sortierung'];
        $s['hallen']     = $hallenNachStelle[$s['id']] ?? [];
    }
    return $stellen;
}

function ladeMessreihen(PDO $pdo): array {
    $reihen = $pdo->query(
        'SELECT * FROM messreihen ORDER BY zeitpunkt DESC, id DESC'
    )->fetchAll();
    $werte = $pdo->query(
        'SELECT id, messreihe_id, ort_id, temperatur, tiefe, notiz FROM messwerte'
    )->fetchAll();

    $nachReihe = [];
    foreach ($werte as $w) {
        $nachReihe[(int)$w['messreihe_id']][] = [
            'id'         => (int)$w['id'],
            'ort_id'     => (int)$w['ort_id'],
            'temperatur' => $w['temperatur'] === null ? null : (float)$w['temperatur'],
            'tiefe'      => $w['tiefe'] ?? '',
            'notiz'      => $w['notiz'],
        ];
    }
    foreach ($reihen as &$r) {
        $r['id']               = (int)$r['id'];
        $r['messstelle_id']    = $r['messstelle_id'] === null ? null : (int)$r['messstelle_id'];
        $r['aussentemperatur'] = $r['aussentemperatur'] === null ? null : (float)$r['aussentemperatur'];
        $r['geo_lat']          = $r['geo_lat'] === null ? null : (float)$r['geo_lat'];
        $r['geo_lon']          = $r['geo_lon'] === null ? null : (float)$r['geo_lon'];
        $r['messwerte']        = $nachReihe[$r['id']] ?? [];
    }
    return $reihen;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

$in     = eingabe();
$action = $in['action'] ?? '';

try {
    // --- Öffentliche Aktionen (ohne Anmeldung) ---
    switch ($action) {
        case 'ping':
            antwort(['ok' => true, 'app' => 'heustockmessen', 'zeit' => date('c')]);

        case 'status':
            db();
            antwort(['ok' => true, 'angemeldet' => istAngemeldet(),
                     'csrf' => istAngemeldet() ? csrfToken() : null]);

        case 'login': {
            $pdo  = db();
            $pass = (string)($in['passwort'] ?? '');
            if (!password_verify($pass, passwortHash($pdo))) {
                usleep(400000);
                fehler('Falsches Passwort.', 401);
            }
            session_regenerate_id(true);
            $_SESSION['auth'] = true;
            antwort(['ok' => true, 'angemeldet' => true, 'csrf' => csrfToken()]);
        }

        case 'logout':
            $_SESSION = [];
            session_destroy();
            antwort(['ok' => true, 'angemeldet' => false]);
    }

    // --- Ab hier ist Anmeldung Pflicht ---
    verlangeAuth();

    // Schreibende Anfragen (POST) brauchen ein gültiges CSRF-Token und erhöhen
    // die Revision (für das Live-Update der anderen Clients).
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        verlangeCsrf($in);
        bumpRev(db());
    }

    switch ($action) {

        case 'stand':
            antwort(['ok' => true, 'rev' => holeRev(db())]);

        case 'passwort_aendern': {
            $pdo = db();
            $alt = (string)($in['alt'] ?? '');
            $neu = (string)($in['neu'] ?? '');
            if (!password_verify($alt, passwortHash($pdo))) {
                fehler('Aktuelles Passwort ist falsch.', 403);
            }
            if (strlen($neu) < 6) {
                fehler('Neues Passwort muss mindestens 6 Zeichen haben.');
            }
            passwortSetzen($pdo, $neu);
            antwort(['ok' => true]);
        }

        case 'stammdaten':
            antwort(['ok' => true, 'messstellen' => ladeStammdaten(db())]);

        case 'messreihen':
            antwort(['ok' => true, 'messreihen' => ladeMessreihen(db())]);

        case 'alles': {
            $pdo = db();
            antwort([
                'ok'          => true,
                'rev'         => holeRev($pdo),
                'schwellen'   => holeSchwellen($pdo),
                'messstellen' => ladeStammdaten($pdo),
                'messreihen'  => ladeMessreihen($pdo),
            ]);
        }

        case 'schwellen_set': {
            $pdo = db();
            $g = zahlOderNull($in['gelb'] ?? null);
            $o = zahlOderNull($in['orange'] ?? null);
            $r = zahlOderNull($in['rot'] ?? null);
            if ($g === null || $o === null || $r === null || !($g < $o && $o < $r)) {
                fehler('Schwellen müssen Zahlen sein mit gelb < orange < rot.');
            }
            $wert = json_encode([
                'gelb' => $g, 'orange' => $o, 'rot' => $r,
                'material' => (string)($in['material'] ?? 'Heu'),
            ]);
            $pdo->prepare("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('schwellen', ?)")
                ->execute([$wert]);
            antwort(['ok' => true]);
        }

        case 'messstelle_duplizieren': {
            $pdo = db();
            $id  = (int)($in['id'] ?? 0);
            $stelle = $pdo->prepare('SELECT name, beschreibung, sortierung FROM messstellen WHERE id=?');
            $stelle->execute([$id]);
            $s = $stelle->fetch();
            if (!$s) fehler('Messstelle nicht gefunden.', 404);

            $pdo->beginTransaction();
            try {
                $name = (string)($in['name'] ?? ($s['name'] . ' (Kopie)'));
                $pdo->prepare('INSERT INTO messstellen (name, beschreibung, sortierung) VALUES (?,?,?)')
                    ->execute([$name, $s['beschreibung'], (int)$s['sortierung']]);
                $neuStelle = (int)$pdo->lastInsertId();

                $hallen = $pdo->prepare('SELECT id, name, beschreibung, sortierung FROM hallen WHERE messstelle_id=? ORDER BY sortierung, id');
                $hallen->execute([$id]);
                $insH = $pdo->prepare('INSERT INTO hallen (messstelle_id, name, beschreibung, sortierung) VALUES (?,?,?,?)');
                $orteStmt = $pdo->prepare('SELECT bezeichnung, sortierung FROM orte WHERE halle_id=? ORDER BY sortierung, id');
                $insO = $pdo->prepare('INSERT INTO orte (halle_id, bezeichnung, sortierung) VALUES (?,?,?)');
                foreach ($hallen->fetchAll() as $h) {
                    $insH->execute([$neuStelle, $h['name'], $h['beschreibung'], (int)$h['sortierung']]);
                    $neuHalle = (int)$pdo->lastInsertId();
                    $orteStmt->execute([(int)$h['id']]);
                    foreach ($orteStmt->fetchAll() as $o) {
                        $insO->execute([$neuHalle, $o['bezeichnung'], (int)$o['sortierung']]);
                    }
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            antwort(['ok' => true, 'id' => $neuStelle]);
        }

        // ---- Messstelle ----
        case 'messstelle_save': {
            $pdo  = db();
            $name = trim((string)($in['name'] ?? ''));
            if ($name === '') {
                fehler('Name der Messstelle fehlt.');
            }
            $id = (int)($in['id'] ?? 0);
            if ($id > 0) {
                $pdo->prepare('UPDATE messstellen SET name=?, beschreibung=?, sortierung=? WHERE id=?')
                    ->execute([$name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0), $id]);
            } else {
                $pdo->prepare('INSERT INTO messstellen (name, beschreibung, sortierung) VALUES (?,?,?)')
                    ->execute([$name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0)]);
                $id = (int)$pdo->lastInsertId();
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'messstelle_delete': {
            $pdo = db();
            $pdo->prepare('DELETE FROM messstellen WHERE id=?')->execute([(int)($in['id'] ?? 0)]);
            antwort(['ok' => true]);
        }

        // ---- Halle ----
        case 'halle_save': {
            $pdo    = db();
            $stelle = (int)($in['messstelle_id'] ?? 0);
            $name   = trim((string)($in['name'] ?? ''));
            if ($stelle <= 0 || $name === '') {
                fehler('Messstelle oder Hallenname fehlt.');
            }
            $id = (int)($in['id'] ?? 0);
            if ($id > 0) {
                $pdo->prepare('UPDATE hallen SET name=?, beschreibung=?, sortierung=? WHERE id=?')
                    ->execute([$name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0), $id]);
            } else {
                $pdo->prepare('INSERT INTO hallen (messstelle_id, name, beschreibung, sortierung) VALUES (?,?,?,?)')
                    ->execute([$stelle, $name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0)]);
                $id = (int)$pdo->lastInsertId();
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'halle_delete': {
            $pdo = db();
            $pdo->prepare('DELETE FROM hallen WHERE id=?')->execute([(int)($in['id'] ?? 0)]);
            antwort(['ok' => true]);
        }

        // ---- Ort ----
        case 'ort_save': {
            $pdo   = db();
            $halle = (int)($in['halle_id'] ?? 0);
            $bez   = trim((string)($in['bezeichnung'] ?? ''));
            if ($halle <= 0 || $bez === '') {
                fehler('Halle oder Bezeichnung fehlt.');
            }
            $id = (int)($in['id'] ?? 0);
            if ($id > 0) {
                $pdo->prepare('UPDATE orte SET bezeichnung=?, sortierung=? WHERE id=?')
                    ->execute([$bez, (int)($in['sortierung'] ?? 0), $id]);
            } else {
                $pdo->prepare('INSERT INTO orte (halle_id, bezeichnung, sortierung) VALUES (?,?,?)')
                    ->execute([$halle, $bez, (int)($in['sortierung'] ?? 0)]);
                $id = (int)$pdo->lastInsertId();
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'ort_delete': {
            $pdo = db();
            $pdo->prepare('DELETE FROM orte WHERE id=?')->execute([(int)($in['id'] ?? 0)]);
            antwort(['ok' => true]);
        }

        // ---- Messreihe inkl. Messwerte (atomar) ----
        case 'messreihe_save': {
            $pdo       = db();
            $zeitpunkt = trim((string)($in['zeitpunkt'] ?? ''));
            if ($zeitpunkt === '') {
                $zeitpunkt = date('c');
            }
            $werte = $in['messwerte'] ?? [];
            if (!is_array($werte)) {
                $werte = [];
            }
            $stelleId = isset($in['messstelle_id']) && $in['messstelle_id'] !== ''
                ? (int)$in['messstelle_id'] : null;

            $pdo->beginTransaction();
            try {
                $id = (int)($in['id'] ?? 0);
                $felder = [
                    $stelleId,
                    $zeitpunkt,
                    zahlOderNull($in['aussentemperatur'] ?? null),
                    (string)($in['temp_quelle'] ?? 'manuell'),
                    zahlOderNull($in['geo_lat'] ?? null),
                    zahlOderNull($in['geo_lon'] ?? null),
                    (string)($in['wetter_text'] ?? ''),
                    (string)($in['messer'] ?? ''),
                    (string)($in['notiz'] ?? ''),
                    (string)($in['foto'] ?? ''),
                ];
                if ($id > 0) {
                    $pdo->prepare(
                        'UPDATE messreihen SET messstelle_id=?, zeitpunkt=?, aussentemperatur=?, temp_quelle=?,
                         geo_lat=?, geo_lon=?, wetter_text=?, messer=?, notiz=?, foto=? WHERE id=?'
                    )->execute([...$felder, $id]);
                    $pdo->prepare('DELETE FROM messwerte WHERE messreihe_id=?')->execute([$id]);
                } else {
                    $pdo->prepare(
                        'INSERT INTO messreihen
                         (messstelle_id, zeitpunkt, aussentemperatur, temp_quelle, geo_lat, geo_lon, wetter_text, messer, notiz, foto)
                         VALUES (?,?,?,?,?,?,?,?,?,?)'
                    )->execute($felder);
                    $id = (int)$pdo->lastInsertId();
                }

                $wStmt = $pdo->prepare(
                    'INSERT INTO messwerte (messreihe_id, ort_id, temperatur, tiefe, notiz) VALUES (?,?,?,?,?)'
                );
                foreach ($werte as $w) {
                    $ort = (int)($w['ort_id'] ?? 0);
                    if ($ort <= 0) {
                        continue;
                    }
                    $temp = zahlOderNull($w['temperatur'] ?? null);
                    $wNotiz = trim((string)($w['notiz'] ?? ''));
                    $wTiefe = trim((string)($w['tiefe'] ?? ''));
                    if ($temp === null && $wNotiz === '' && $wTiefe === '') {
                        continue; // komplett leeren Wert nicht speichern
                    }
                    $wStmt->execute([$id, $ort, $temp, $wTiefe, $wNotiz]);
                }

                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'messreihe_delete': {
            $pdo = db();
            $pdo->prepare('DELETE FROM messreihen WHERE id=?')->execute([(int)($in['id'] ?? 0)]);
            antwort(['ok' => true]);
        }

        // ---- Backup einspielen (ersetzt den gesamten Datenbestand) ----
        case 'restore': {
            $pdo     = db();
            $stellen = is_array($in['messstellen'] ?? null) ? $in['messstellen'] : [];
            $reihen  = is_array($in['messreihen'] ?? null) ? $in['messreihen'] : [];

            $pdo->exec('PRAGMA foreign_keys = OFF');
            $pdo->beginTransaction();
            try {
                foreach (['messwerte', 'messreihen', 'orte', 'hallen', 'messstellen'] as $t) {
                    $pdo->exec("DELETE FROM $t");
                }
                $iStelle = $pdo->prepare('INSERT INTO messstellen (id, name, beschreibung, sortierung) VALUES (?,?,?,?)');
                $iHalle  = $pdo->prepare('INSERT INTO hallen (id, messstelle_id, name, beschreibung, sortierung) VALUES (?,?,?,?,?)');
                $iOrt    = $pdo->prepare('INSERT INTO orte (id, halle_id, bezeichnung, sortierung) VALUES (?,?,?,?)');
                foreach ($stellen as $s) {
                    $iStelle->execute([(int)$s['id'], (string)($s['name'] ?? ''), (string)($s['beschreibung'] ?? ''), (int)($s['sortierung'] ?? 0)]);
                    foreach (($s['hallen'] ?? []) as $h) {
                        $iHalle->execute([(int)$h['id'], (int)$s['id'], (string)($h['name'] ?? ''), (string)($h['beschreibung'] ?? ''), (int)($h['sortierung'] ?? 0)]);
                        foreach (($h['orte'] ?? []) as $o) {
                            $iOrt->execute([(int)$o['id'], (int)$h['id'], (string)($o['bezeichnung'] ?? ''), (int)($o['sortierung'] ?? 0)]);
                        }
                    }
                }
                $iReihe = $pdo->prepare(
                    'INSERT INTO messreihen (id, messstelle_id, zeitpunkt, aussentemperatur, temp_quelle, geo_lat, geo_lon, wetter_text, messer, notiz, foto)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)'
                );
                $iWert = $pdo->prepare('INSERT INTO messwerte (id, messreihe_id, ort_id, temperatur, tiefe, notiz) VALUES (?,?,?,?,?,?)');
                foreach ($reihen as $r) {
                    $iReihe->execute([
                        (int)$r['id'], isset($r['messstelle_id']) && $r['messstelle_id'] !== null ? (int)$r['messstelle_id'] : null,
                        (string)($r['zeitpunkt'] ?? ''), zahlOderNull($r['aussentemperatur'] ?? null),
                        (string)($r['temp_quelle'] ?? 'manuell'), zahlOderNull($r['geo_lat'] ?? null), zahlOderNull($r['geo_lon'] ?? null),
                        (string)($r['wetter_text'] ?? ''), (string)($r['messer'] ?? ''), (string)($r['notiz'] ?? ''), (string)($r['foto'] ?? ''),
                    ]);
                    foreach (($r['messwerte'] ?? []) as $w) {
                        $iWert->execute([(int)$w['id'], (int)$r['id'], (int)$w['ort_id'], zahlOderNull($w['temperatur'] ?? null), (string)($w['tiefe'] ?? ''), (string)($w['notiz'] ?? '')]);
                    }
                }
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                $pdo->exec('PRAGMA foreign_keys = ON');
                throw $e;
            }
            $pdo->exec('PRAGMA foreign_keys = ON');
            antwort(['ok' => true]);
        }

        default:
            fehler('Unbekannte Aktion: ' . (string)$action, 404);
    }
} catch (Throwable $e) {
    fehler('Serverfehler: ' . $e->getMessage(), 500);
}
