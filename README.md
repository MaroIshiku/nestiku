# Nestiku

Personal Startpage fuer private Self-Hosting-Setups.

Nestiku ist eine kleine, sichere Startseiten-App mit Suche, Wetter, Schnellzugriffen, First-Run-Setup und Adminbereich. Die Oberflaeche folgt dem gemeinsamen Pixel Soft Utility Designkonzept: ruhig, abgerundet, mobil gut bedienbar und auf Desktop als klares Dashboard.

## Funktionen

- geschuetzte persoenliche Startseite mit Uhr, Begruessung, Wetter und Suche
- Schnellzugriffe mit Farben, Texticons oder gecachten Favicons
- Adminbereich fuer Links, Standort, Wetter, Suchmaschine und Anmeldedaten
- First-Run-Setup fuer den ersten Adminaccount
- sechs Themes: Lavender, Mint, Sky, Amber, Rose, Graphite
- Light, Dark und System Mode
- Healthcheck unter `/healthz`, Readiness unter `/readyz`

## Schnellstart

```bash
cp .env.example .env
mkdir -p secrets data
openssl rand -base64 48 > secrets/setup_secret.txt
```

Setze in `.env` ein eigenes `SESSION_SECRET`, dann:

```bash
docker compose up -d --build
```

Die App ist danach erreichbar unter:

```txt
http://localhost:8503
```

Intern lauscht Nestiku auf Port `8080`. Docker Compose published bewusst `8503:8080`.

## Erstes Setup

Beim ersten Oeffnen erscheint automatisch der Setup-Dialog. Du brauchst:

- Setup-Secret aus `secrets/setup_secret.txt`
- Anzeigename
- Admin-Benutzername
- Admin-Passwort

Das Admin-Passwort muss mindestens 12 Zeichen lang sein und darf nicht mit dem Setup-Secret uebereinstimmen. Nach dem ersten Adminaccount ist die oeffentliche Registrierung geschlossen.

## Sicherheit

- keine Default-Zugangsdaten
- Setup-Secret wird serverseitig geprueft
- bevorzugt Docker Secret als Datei unter `/run/secrets/nestiku_setup_secret`
- Passwoerter werden mit `scrypt` gehasht
- Session-Cookie ist `HttpOnly`, `SameSite=Strict` und HMAC-signiert
- Content Security Policy, `X-Frame-Options`, `nosniff`, `no-referrer`
- API-Inputs werden serverseitig validiert
- `data/`, `.env`, `secrets/`, Logs und Datenbanken werden nicht committed

## Daten

Persistente Daten liegen im Projektordner unter:

```txt
./data
```

Im Container ist dieser Ordner nach `/app/data` gemountet.

Backup:

```bash
tar -czf nestiku-backup-$(date +%Y%m%d).tar.gz data
```

## Entwicklung ohne Docker

```bash
npm install
SESSION_SECRET=dev-secret ISHIKU_SETUP_SECRET=dev-setup-secret PORT=8080 npm run dev
```

## Struktur

```txt
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── src/
│   ├── auth.js
│   ├── server.js
│   └── storage.js
├── public/
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   └── assets/nestiku.png
└── data/
```

## Erstellt mit ChatGPT Codex

Dieses Projekt wurde mit Unterstuetzung von ChatGPT Codex erstellt bzw. ueberarbeitet. Betrieb, Pruefung, Sicherheit und Veroeffentlichung liegen beim Repository-Betreiber.
