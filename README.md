# Image Wall

Eine Ein-Seiten-Web-App (Angular 21), die Bilder als Raster anzeigt – aus
Bluesky- und Mastodon-Konten, Reddit-Subreddits und X-Konten (über Nitter).
Favoriten, gespeicherte Quellen und die Galerie liegen im Browser
(localStorage) – es gibt keine Datenbank und keinen Login.

Eingabe (alles im selben Feld):

| Quelle | Beispiel |
|---|---|
| Bluesky | `esa.int`, `jemand.bsky.social`, `bsky.app/profile/…` |
| Mastodon | `@eff@mastodon.social`, `https://server.tld/@name` |
| Reddit | `r/EarthPorn`, Subreddit-URL |
| X | `ArchDigest`, `@ArchDigest`, Profil-URL |

Woran die App die Quelle erkennt: Eine Mastodon-Adresse hat zwei Teile mit `@`
dazwischen, ein Bluesky-Handle ist eine Adresse mit Punkt, ein X-Handle hat
weder das eine noch das andere.

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
  bluesky/bluesky.source.ts Bluesky, direkt aus dem Browser
  mastodon/mastodon.source.ts Mastodon, direkt aus dem Browser
  reddit/reddit.source.ts   Reddit über den eigenen Vermittler (worker/)
  x/x.source.ts        X über nitter.net
```

## Hinweise

- Feeds lassen sich nicht direkt aus dem Browser lesen (kein CORS-Header).
  Reddit läuft deshalb über den eigenen Vermittler, X über `api.rss2json.com`.
  Ist die Nitter-Instanz gerade nicht erreichbar, bleibt das Raster leer –
  das ist keine Fehlfunktion der App. Die Fußleiste zeigt für jede Quelle an,
  ob sie gerade erreichbar ist (Klick darauf prüft sofort neu).
- **Bluesky:** bis zu 100 Bilder pro Konto. Die einzige Quelle ohne
  Zwischenstation – Bluesky erlaubt fremden Seiten den Zugriff ausdrücklich
  (CORS), und der Filter `posts_with_media` wirft den Text schon auf dem Server
  weg. Kein Schlüssel, keine Anmeldung, kein Ratenlimit, das sich alle teilen
  (Bluesky zählt pro IP, also pro Besucher). Videos werden übersprungen.
- **Mastodon:** bis zu 100 Bilder pro Konto, ebenfalls ohne Zwischenstation.
  Gefragt wird immer der Server, auf dem das Konto liegt (`@name@server.tld`).
  Pro Abruf gibt Mastodon 40 Beiträge heraus, die App blättert höchstens
  dreimal. Die Bilder lassen sich hier sogar direkt herunterladen – für das ZIP
  braucht es keinen Umweg.
- **X:** bis zu 20 Bilder pro Konto (ein Beitrag kann mehrere Bilder haben).
- **Reddit:** bis zu 100 Bilder pro Subreddit über den eigenen Vermittler
  (Cloudflare Worker, Quelltext in [`worker/`](worker/)). Er holt Reddits Feed
  direkt; nur über ihn kommen auch Subreddits an, die `rss2json` nicht
  durchreicht. Ist er nicht erreichbar, fällt die App auf `rss2json` zurück –
  dann sind es 10 Bilder, weil der Dienst ohne API-Schlüssel nur 10 Beiträge
  herausgibt. Reddits eigene JSON-API (`/r/<sub>/hot.json`) scheidet aus: 403
  ohne Anmeldung und kein CORS-Header.
- Reddit liefert im Feed nur ein kleines Vorschaubild. Da
  `preview.redd.it/<id>.jpg` und `i.redd.it/<id>.jpg` dieselbe Datei sind,
  rechnet die App die Adresse auf das Original um.
- Der ZIP-Download der Favoriten lädt X-Bilder direkt von `pbs.twimg.com`
  (die Nitter-URL wird vorher zurückgerechnet). Reddit und Bluesky verbieten
  das Laden per JavaScript auf ihren Bild-Servern, deshalb laufen deren Bilder
  für das ZIP über den Bild-Weiterleiter `images.weserv.nl`.
