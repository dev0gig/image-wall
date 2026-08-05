# Image Wall

Eine Ein-Seiten-Web-App (Angular 21), die Bilder eines X-/Twitter-Kontos über
Nitter als Raster anzeigt. Favoriten, gespeicherte Konten und die Galerie liegen
im Browser (localStorage) – es gibt keinen Server und keine Datenbank.

Live: https://dev0gig.github.io/image-wall/

## Lokal starten

Voraussetzung: Node.js 22

```bash
npm install
npm run dev      # läuft auf http://localhost:3000
```

## Bauen

```bash
npm run build    # Ergebnis: dist/app/browser
```

Der Build ist rein statisch (kein SSR). In der Produktions-Konfiguration ist
`baseHref` auf `/image-wall/` gesetzt, weil GitHub Pages die Seite in einem
Unterordner ausliefert. Der Entwicklungs-Server nutzt weiterhin `/`.

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` startet den Workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): er baut die App
und schiebt `dist/app/browser` zu GitHub Pages. Voraussetzung ist, dass unter
*Settings → Pages* als Quelle **GitHub Actions** eingestellt ist.

Zwei Kleinigkeiten sorgen dafür, dass Pages die Dateien richtig ausliefert:

- `public/.nojekyll` – verhindert, dass Pages die Dateien durch Jekyll schickt.
- `404.html` – wird beim Deploy aus der `index.html` kopiert, damit direkt
  aufgerufene Unterseiten nicht ins Leere laufen.

## Hinweise

- Die Bilder kommen über `nitter.net` und werden per `api.rss2json.com`
  ausgelesen. Ist die Nitter-Instanz gerade nicht erreichbar, bleibt das Raster
  leer – das ist keine Fehlfunktion der App.
- Der ZIP-Download der Favoriten lädt die Bilder direkt von `pbs.twimg.com`.
  Nitter selbst erlaubt das nicht (kein CORS-Header), deshalb wird die
  Nitter-URL vorher in die Original-URL zurückgerechnet.
