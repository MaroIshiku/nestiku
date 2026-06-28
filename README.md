# Nestiku

Personal Startpage

> Private, self-hosted Startseite im gemeinsamen Pixel Soft Utility Designsystem.

## Kurzbeschreibung

Nestiku ist eine self-hosted Web-App aus der ishiku-Familie. Die App ist fuer private oder kleine eigene Deployments gedacht und bietet eine geschuetzte persoenliche Startseite mit Suche, Wetter, Schnellzugriffen und Adminbereich.

## Teil der ishiku-Familie

Nestiku verwendet die gemeinsame ishiku Oberflaeche:

- ruhige, abgerundete Pixel-Soft-Utility-Komponenten
- sechs gemeinsame Themes: Lavender, Mint, Sky, Amber, Rose und Graphite
- Light, Dark und System Mode
- einheitlicher AppHeader, Profil-/Einstellungs-Sheets und About/Admin-Bereiche
- einheitliches First-Run-Setup fuer den ersten Adminaccount

Die App soll sich bewusst wie Teil einer gemeinsamen Suite anfuehlen, nicht wie eine separate Marke mit eigener Designsprache.

## Funktionen

- persoenliche Startseite mit Uhr, Begruessung, Wetter und Suchfeld
- Schnellzugriffe mit Pagination, lokalen Icon-/Favicon-Optionen und Adminsortierung
- geschuetzter Adminbereich fuer Links, Standort, Wetter, Suche und Anmeldedaten
- First-Run-Setup mit Setup-Secret und geschlossenem Registrierungsfenster nach dem ersten Admin
- gemeinsame Pixel Soft Utility Themes mit persistiertem Theme und Mode

## Tech Stack

- Frontend: Vanilla HTML, CSS und ES-Module
- Backend: Node.js mit Express
- Datenhaltung: atomare JSON-Dateien im persistenten Datenordner
- Deployment: Docker / Docker Compose

## Installation

### Docker Compose

```bash
mkdir -p nestiku/secrets nestiku/data
cd nestiku
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env
```

Lege anschliessend ein langes zufaelliges Setup-Secret an:

```bash
openssl rand -base64 48 > secrets/setup_secret.txt
chmod 600 secrets/setup_secret.txt
```

Setze in `.env` ein eigenes `SESSION_SECRET` und starte die App:

```bash
docker compose up -d
```

### Erstes Starten

Beim ersten Oeffnen zeigt Nestiku automatisch das Registrierungsfenster fuer den ersten Adminaccount an. Die normale App ist vorher nicht sichtbar.

### Adminaccount erstellen

Im Registrierungsfenster werden benoetigt:

- Setup-Secret aus `secrets/setup_secret.txt`
- Anzeigename
- Admin-Benutzername
- optional E-Mail
- Admin-Passwort

Das Admin-Passwort muss mindestens 12 Zeichen lang sein und darf nicht mit dem Setup-Secret uebereinstimmen. Nach erfolgreicher Erstellung des ersten Adminaccounts wird die oeffentliche Registrierung automatisch geschlossen.

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Standard |
| --- | --- | --- |
| `SESSION_SECRET` | Geheimnis zum Signieren der Session-Cookies | Pflicht |
| `TZ` | Zeitzone fuer Logs und Anzeige | `Europe/Berlin` |
| `ISHIKU_APP_URL` | Oeffentliche URL der App | leer |
| `ISHIKU_BASE_PATH` | Basis-Pfad hinter Reverse Proxy | `/` |
| `ISHIKU_DATA_DIR` | Persistenter Datenpfad im Container | `/data` |
| `ISHIKU_LOG_LEVEL` | Log-Level | `info` |
| `ISHIKU_SETUP_SECRET_FILE` | Pfad zum Docker-Secret | `/run/secrets/ishiku_setup_secret` |
| `ISHIKU_SETUP_SECRET` | Fallback-Secret als ENV, nur wenn kein Secret-File genutzt wird | leer |
| `FORCE_HTTPS` | HTTPS hinter Reverse Proxy erzwingen | `true` |
| `REQUIRE_MOBILE` | Zugriff auf mobile User-Agents begrenzen | `false` |

### Docker Secrets

Bevorzugt wird ein Docker/Compose Secret als Datei. In `docker-compose.example.yml` wird dieses Secret nach `/run/secrets/ishiku_setup_secret` gemountet.

### Persistente Daten

Persistente Daten liegen standardmaessig in:

```txt
/data
```

Sichere diesen Ordner regelmaessig, wenn die App produktiv genutzt wird.

## Sicherheit

- Das Setup-Secret dient nur zur ersten Admin-Registrierung.
- Das Admin-Passwort darf nicht dem Setup-Secret entsprechen.
- Passwoerter werden mit scrypt gehasht und nicht im Klartext gespeichert.
- Die oeffentliche Registrierung wird nach dem ersten Adminaccount geschlossen.
- Session-Cookies sind HMAC-signiert, `HttpOnly` und `SameSite=Strict`.
- Secrets, `.env`, Datenbanken, Logs und der Datenordner gehoeren nicht ins Repository.

## Updates und Backup

```bash
docker compose pull
docker compose up -d
```

Vor Updates sollte der persistente Datenordner gesichert werden:

```bash
tar -czf backup-nestiku-$(date +%Y%m%d).tar.gz data
```

## Entwicklung

```bash
npm install
SESSION_SECRET=dev ISHIKU_SETUP_SECRET=dev-setup-secret npm run dev
```

Codex soll bei Aenderungen das gemeinsame Pixel Soft Utility Designsystem beibehalten und keine app-spezifischen UI-Abweichungen einfuehren.

## Erstellt mit ChatGPT Codex

Dieses Projekt wurde mit Unterstuetzung von ChatGPT Codex erstellt bzw. ueberarbeitet. Codex wurde verwendet, um Code, Struktur, UI-Komponenten und Dokumentation nach den Vorgaben der ishiku / Pixel Soft Utility Standards zu generieren.

Die Verantwortung fuer Betrieb, Pruefung, Sicherheit und Veroeffentlichung liegt beim Repository-Betreiber.

## Status und Lizenz

Status: aktiv in Entwicklung

Lizenz: nicht angegeben
