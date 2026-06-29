# Nestiku

Personal Startpage fuer private Self-Hosting-Setups.

Nestiku ist eine kleine, sichere Startseiten-App mit Suche, Wetter, Schnellzugriffen, First-Run-Setup und Adminbereich. Die Oberflaeche folgt dem gemeinsamen Pixel Soft Utility Designkonzept: ruhig, konsistent, mobil gut bedienbar und auf Desktop als klares Dashboard.

## Funktionen

- geschuetzte persoenliche Startseite mit Uhr, Begruessung, Wetter und Suche
- Schnellzugriffe mit Farben, Texticons oder sicher gecachten Favicons
- Linkbearbeitung direkt auf der Startseite
- Settings fuer Standort, Wetter, Suchmaschine, Darstellung und Anmeldedaten
- First-Run-Setup fuer den ersten Adminaccount
- sechs Themes: Lavender, Mint, Sky, Amber, Rose, Graphite
- Light, Dark und System Mode
- Healthcheck unter `/healthz`, Readiness unter `/readyz`

## Schnellstart

```bash
cp .env.example .env
```

Setze in `.env` mindestens `ISHIKU_SETUP_SECRET`. Ein eigenes `SESSION_SECRET`
ist empfohlen; wenn es leer bleibt, erzeugt Nestiku beim ersten Start ein
persistentes Secret unter `/data/session_secret`.

```bash
docker compose up -d
```

Die App ist danach erreichbar unter:

```txt
http://localhost:8503
```

Intern lauscht Nestiku auf Port `8080`. Docker Compose published bewusst `8503:8080`.

## Docker Compose

Die Compose-Datei ist auf Self-Hosting und Appliance-Setups ausgelegt:

- Image `ghcr.io/maroishiku/nestiku:latest`; wird per GitHub Actions aus `main` gebaut
- eigenes Compose-Projekt `nestiku-startpage`
- Service, Container, Hostname und Netzwerk `Nestiku`
- long-syntax Port-Mapping `8503 -> 8080`
- persistenter Bind-Mount `/DATA/AppData/ish_nestiku/data -> /data`
- `SESSION_SECRET` und `ISHIKU_SETUP_SECRET` als Installer-kompatible Umgebungsvariablen
- automatisches persistentes Session-Secret unter `/data/session_secret`, falls `SESSION_SECRET` leer bleibt
- read-only Container mit `tmpfs` fuer `/tmp`
- `cap_drop: ALL`, `no-new-privileges`, `privileged: false`
- `cap_add: CHOWN, SETGID, SETUID` wie bei den Ishiku-App-YAMLs
- feste Runtime-UID/GID `10001`
- CPU-, RAM- und PID-Limits
- `pull_policy: always`
- JSON-Logrotation
- OCI-Labels und CasaOS/ZimaOS-Metadaten

Falls ein Installer das Image nicht pullen kann, pruefe in GitHub Packages, ob
`ghcr.io/maroishiku/nestiku` oeffentlich sichtbar ist. Der Workflow unter
`.github/workflows/publish-image.yml` baut und pushed `latest` automatisch.

## Erstes Setup

Beim ersten Oeffnen erscheint automatisch der Setup-Dialog. Du brauchst:

- Setup-Secret aus `ISHIKU_SETUP_SECRET`
- Anzeigename
- Admin-Benutzername
- Admin-Passwort

Das Admin-Passwort muss mindestens 12 Zeichen lang sein und darf nicht mit dem Setup-Secret uebereinstimmen. Nach dem ersten Adminaccount ist die oeffentliche Registrierung geschlossen.

## Sicherheit

- keine Default-Zugangsdaten
- Setup-Secret wird serverseitig geprueft
- Setup-Secret wird ueber `ISHIKU_SETUP_SECRET` gesetzt
- Session-Secret wird aus `SESSION_SECRET` oder persistent aus `/data/session_secret` geladen
- Favicon-Abrufe blockieren lokale und private Zieladressen
- Docker Compose startet den Container read-only, ohne Linux-Capabilities und mit `no-new-privileges`
- Container laeuft als feste UID/GID `10001` und schreibt nur nach `/data`
- Ressourcenlimits fuer CPU, RAM und PIDs sind gesetzt
- Passwoerter werden mit `scrypt` gehasht
- Session-Cookie ist `HttpOnly`, `SameSite=Strict` und HMAC-signiert
- Content Security Policy, `X-Frame-Options`, `nosniff`, `no-referrer`
- API-Inputs werden serverseitig validiert
- `data/`, `.env`, `secrets/`, Logs und Datenbanken werden nicht committed

## Daten

Persistente Daten liegen im Projektordner unter:

```txt
/DATA/AppData/ish_nestiku/data
```

Im Container ist dieser Ordner nach `/data` gemountet.

Auf Linux-Hosts kann es noetig sein, dem Runtime-User Schreibrechte zu geben:

```bash
sudo mkdir -p /DATA/AppData/ish_nestiku/data
sudo chown -R 10001:10001 /DATA/AppData/ish_nestiku/data
```

Backup:

```bash
tar -czf nestiku-backup-$(date +%Y%m%d).tar.gz /DATA/AppData/ish_nestiku/data
```

## Entwicklung ohne Docker

```bash
npm install
SESSION_SECRET=dev-secret ISHIKU_SETUP_SECRET=dev-setup-secret PORT=8080 npm run dev
```

## Struktur

```txt
.
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- src/
|   |-- auth.js
|   |-- server.js
|   `-- storage.js
|-- public/
|   |-- app.js
|   |-- index.html
|   |-- styles.css
|   `-- assets/nestiku.png
`-- data/
```

## Erstellt mit ChatGPT Codex

Dieses Projekt wurde mit Unterstuetzung von ChatGPT Codex erstellt bzw. ueberarbeitet. Betrieb, Pruefung, Sicherheit und Veroeffentlichung liegen beim Repository-Betreiber.
