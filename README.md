# Image Wall

Eine Ein-Seiten-Web-App (Angular 21), die Bilder als Raster anzeigt – aus
X-/Twitter-Konten (über Nitter) und aus Reddit-Subreddits. Favoriten,
gespeicherte Quellen und die Galerie liegen im Browser (localStorage) – es gibt
keinen Server und keine Datenbank.

Eingabe: `ArchDigest`, `@ArchDigest` oder eine X-Profil-URL für X;
`r/EarthPorn` oder eine Subreddit-URL für Reddit.

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

## Quellen

Jede Bild-Quelle liegt in `src/app/sources/` in einem eigenen Ordner und bringt
einen Adapter mit (erkennen, benennen, Bilder holen, Download-Adresse liefern).
Die Oberfläche kennt nur `src/app/sources/index.ts` und muss nicht wissen,
woher ein Kanal stammt. Eine neue Quelle braucht nur einen neuen Ordner und
einen Eintrag in `SOURCES`.

```
src/app/sources/
  image-item.ts        gemeinsame Typen (ImageItem, SourceAdapter)
  rss2json.ts          Helfer für api.rss2json.com (von beiden Quellen genutzt)
  index.ts             Verzeichnis aller Quellen
  x/x.source.ts        X über nitter.net
  reddit/reddit.source.ts   Reddit über den RSS-Feed des Subreddits
```

## Hinweise

- Die Feeds von Nitter und Reddit lassen sich nicht direkt aus dem Browser
  lesen (kein CORS-Header), deshalb läuft beides über `api.rss2json.com`.
  Ist die Nitter-Instanz gerade nicht erreichbar, bleibt das Raster leer –
  das ist keine Fehlfunktion der App.
- **X:** bis zu 20 Bilder pro Konto (ein Beitrag kann mehrere Bilder haben).
- **Reddit:** bis zu 10 Bilder pro Subreddit. `rss2json` gibt ohne API-Schlüssel
  nur 10 Beiträge heraus und ein Reddit-Beitrag bringt im Feed genau ein Bild
  mit. Die eigentliche Reddit-API (`/r/<sub>/hot.json`) fällt aus: sie
  antwortet Besuchern ohne Anmeldung mit 403 und schickt ebenfalls keinen
  CORS-Header. Der erste Abruf eines Subreddits scheitert bei Reddit öfter,
  darum fragt die App bis zu dreimal nach.
- Reddit liefert im Feed nur ein kleines Vorschaubild. Da
  `preview.redd.it/<id>.jpg` und `i.redd.it/<id>.jpg` dieselbe Datei sind,
  rechnet die App die Adresse auf das Original um.
- Der ZIP-Download der Favoriten lädt X-Bilder direkt von `pbs.twimg.com`
  (die Nitter-URL wird vorher zurückgerechnet). Reddit verbietet das Laden per
  JavaScript auf allen seinen Bild-Servern, deshalb laufen Reddit-Bilder für
  das ZIP über den Bild-Weiterleiter `images.weserv.nl`.
