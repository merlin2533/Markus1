<?php
/**
 * Heustockmessen – minimales JSON-API über SQLite (PDO).
 *
 * Eine einzige Datei, keine externen Abhängigkeiten. Die Datenbank wird beim
 * ersten Aufruf automatisch unter data/heustock.sqlite angelegt. So können
 * mehrere Personen über denselben Server auf denselben Datenbestand zugreifen.
 *
 * Aufruf:
 *   GET  api.php?action=ping
 *   GET  api.php?action=stammdaten
 *   GET  api.php?action=messreihen
 *   POST api.php            (JSON-Body mit Feld "action")
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
    // Body als JSON, sonst $_POST/$_GET als Fallback.
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
        CREATE TABLE IF NOT EXISTS ebenen (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            messstelle_id INTEGER NOT NULL REFERENCES messstellen(id) ON DELETE CASCADE,
            bezeichnung   TEXT NOT NULL,
            sortierung    INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS messreihen (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            zeitpunkt        TEXT NOT NULL,
            aussentemperatur REAL,
            temp_quelle      TEXT DEFAULT 'manuell',
            geo_lat          REAL,
            geo_lon          REAL,
            wetter_text      TEXT DEFAULT '',
            messer           TEXT DEFAULT '',
            notiz            TEXT DEFAULT '',
            erstellt_am      TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messwerte (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            messreihe_id INTEGER NOT NULL REFERENCES messreihen(id) ON DELETE CASCADE,
            ebene_id     INTEGER NOT NULL REFERENCES ebenen(id) ON DELETE CASCADE,
            temperatur   REAL,
            notiz        TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS einstellungen (
            schluessel TEXT PRIMARY KEY,
            wert       TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ebenen_stelle   ON ebenen(messstelle_id);
        CREATE INDEX IF NOT EXISTS idx_werte_reihe      ON messwerte(messreihe_id);
        CREATE INDEX IF NOT EXISTS idx_werte_ebene      ON messwerte(ebene_id);
    SQL);
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

/** Wert aus Eingabe als float oder null. */
function zahlOderNull($wert): ?float {
    if ($wert === '' || $wert === null) {
        return null;
    }
    return is_numeric($wert) ? (float)$wert : null;
}

// ---------------------------------------------------------------------------
// Stammdaten: Messstellen + Ebenen
// ---------------------------------------------------------------------------

function ladeStammdaten(PDO $pdo): array {
    $stellen = $pdo->query(
        'SELECT id, name, beschreibung, sortierung FROM messstellen ORDER BY sortierung, id'
    )->fetchAll();
    $ebenen = $pdo->query(
        'SELECT id, messstelle_id, bezeichnung, sortierung FROM ebenen ORDER BY sortierung, id'
    )->fetchAll();

    $nachStelle = [];
    foreach ($ebenen as $e) {
        $nachStelle[(int)$e['messstelle_id']][] = [
            'id'          => (int)$e['id'],
            'bezeichnung' => $e['bezeichnung'],
            'sortierung'  => (int)$e['sortierung'],
        ];
    }
    foreach ($stellen as &$s) {
        $s['id']         = (int)$s['id'];
        $s['sortierung'] = (int)$s['sortierung'];
        $s['ebenen']     = $nachStelle[$s['id']] ?? [];
    }
    return $stellen;
}

function ladeMessreihen(PDO $pdo): array {
    $reihen = $pdo->query(
        'SELECT * FROM messreihen ORDER BY zeitpunkt DESC, id DESC'
    )->fetchAll();
    $werte = $pdo->query(
        'SELECT id, messreihe_id, ebene_id, temperatur, notiz FROM messwerte'
    )->fetchAll();

    $nachReihe = [];
    foreach ($werte as $w) {
        $nachReihe[(int)$w['messreihe_id']][] = [
            'id'         => (int)$w['id'],
            'ebene_id'   => (int)$w['ebene_id'],
            'temperatur' => $w['temperatur'] === null ? null : (float)$w['temperatur'],
            'notiz'      => $w['notiz'],
        ];
    }
    foreach ($reihen as &$r) {
        $r['id']               = (int)$r['id'];
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
            db(); // stellt sicher, dass DB/Schema existieren
            antwort(['ok' => true, 'angemeldet' => istAngemeldet()]);

        case 'login': {
            $pdo  = db();
            $pass = (string)($in['passwort'] ?? '');
            if (!password_verify($pass, passwortHash($pdo))) {
                // kleine Verzögerung gegen Brute-Force
                usleep(400000);
                fehler('Falsches Passwort.', 401);
            }
            session_regenerate_id(true);
            $_SESSION['auth'] = true;
            antwort(['ok' => true, 'angemeldet' => true]);
        }

        case 'logout':
            $_SESSION = [];
            session_destroy();
            antwort(['ok' => true, 'angemeldet' => false]);
    }

    // --- Ab hier ist Anmeldung Pflicht ---
    verlangeAuth();

    switch ($action) {

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

        case 'alles':
            $pdo = db();
            antwort([
                'ok'          => true,
                'messstellen' => ladeStammdaten($pdo),
                'messreihen'  => ladeMessreihen($pdo),
            ]);

        // ---- Messstelle ----
        case 'messstelle_save': {
            $pdo  = db();
            $name = trim((string)($in['name'] ?? ''));
            if ($name === '') {
                fehler('Name der Messstelle fehlt.');
            }
            $id = (int)($in['id'] ?? 0);
            if ($id > 0) {
                $stmt = $pdo->prepare(
                    'UPDATE messstellen SET name=?, beschreibung=?, sortierung=? WHERE id=?'
                );
                $stmt->execute([$name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0), $id]);
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO messstellen (name, beschreibung, sortierung) VALUES (?,?,?)'
                );
                $stmt->execute([$name, (string)($in['beschreibung'] ?? ''), (int)($in['sortierung'] ?? 0)]);
                $id = (int)$pdo->lastInsertId();
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'messstelle_delete': {
            $pdo = db();
            $id  = (int)($in['id'] ?? 0);
            $pdo->prepare('DELETE FROM messstellen WHERE id=?')->execute([$id]);
            antwort(['ok' => true]);
        }

        // ---- Ebene / Heuballen ----
        case 'ebene_save': {
            $pdo   = db();
            $stelle = (int)($in['messstelle_id'] ?? 0);
            $bez    = trim((string)($in['bezeichnung'] ?? ''));
            if ($stelle <= 0 || $bez === '') {
                fehler('Messstelle oder Bezeichnung fehlt.');
            }
            $id = (int)($in['id'] ?? 0);
            if ($id > 0) {
                $stmt = $pdo->prepare('UPDATE ebenen SET bezeichnung=?, sortierung=? WHERE id=?');
                $stmt->execute([$bez, (int)($in['sortierung'] ?? 0), $id]);
            } else {
                $stmt = $pdo->prepare(
                    'INSERT INTO ebenen (messstelle_id, bezeichnung, sortierung) VALUES (?,?,?)'
                );
                $stmt->execute([$stelle, $bez, (int)($in['sortierung'] ?? 0)]);
                $id = (int)$pdo->lastInsertId();
            }
            antwort(['ok' => true, 'id' => $id]);
        }

        case 'ebene_delete': {
            $pdo = db();
            $id  = (int)($in['id'] ?? 0);
            $pdo->prepare('DELETE FROM ebenen WHERE id=?')->execute([$id]);
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

            $pdo->beginTransaction();
            try {
                $id = (int)($in['id'] ?? 0);
                $felder = [
                    $zeitpunkt,
                    zahlOderNull($in['aussentemperatur'] ?? null),
                    (string)($in['temp_quelle'] ?? 'manuell'),
                    zahlOderNull($in['geo_lat'] ?? null),
                    zahlOderNull($in['geo_lon'] ?? null),
                    (string)($in['wetter_text'] ?? ''),
                    (string)($in['messer'] ?? ''),
                    (string)($in['notiz'] ?? ''),
                ];
                if ($id > 0) {
                    $stmt = $pdo->prepare(
                        'UPDATE messreihen SET zeitpunkt=?, aussentemperatur=?, temp_quelle=?,
                         geo_lat=?, geo_lon=?, wetter_text=?, messer=?, notiz=? WHERE id=?'
                    );
                    $stmt->execute([...$felder, $id]);
                    $pdo->prepare('DELETE FROM messwerte WHERE messreihe_id=?')->execute([$id]);
                } else {
                    $stmt = $pdo->prepare(
                        'INSERT INTO messreihen
                         (zeitpunkt, aussentemperatur, temp_quelle, geo_lat, geo_lon, wetter_text, messer, notiz)
                         VALUES (?,?,?,?,?,?,?,?)'
                    );
                    $stmt->execute($felder);
                    $id = (int)$pdo->lastInsertId();
                }

                $wStmt = $pdo->prepare(
                    'INSERT INTO messwerte (messreihe_id, ebene_id, temperatur, notiz) VALUES (?,?,?,?)'
                );
                foreach ($werte as $w) {
                    $ebene = (int)($w['ebene_id'] ?? 0);
                    if ($ebene <= 0) {
                        continue;
                    }
                    $temp = zahlOderNull($w['temperatur'] ?? null);
                    if ($temp === null && trim((string)($w['notiz'] ?? '')) === '') {
                        continue; // leeren Wert ohne Notiz nicht speichern
                    }
                    $wStmt->execute([$id, $ebene, $temp, (string)($w['notiz'] ?? '')]);
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
            $id  = (int)($in['id'] ?? 0);
            $pdo->prepare('DELETE FROM messreihen WHERE id=?')->execute([$id]);
            antwort(['ok' => true]);
        }

        default:
            fehler('Unbekannte Aktion: ' . (string)$action, 404);
    }
} catch (Throwable $e) {
    fehler('Serverfehler: ' . $e->getMessage(), 500);
}
