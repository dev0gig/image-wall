# Image Wall

Eine Ein-Seiten-Web-App (Angular 21), die Bilder als Raster anzeigt – aus
Bluesky- und Mastodon-Konten und Reddit-Subreddits.
Favoriten, gespeicherte Quellen und die Galerie liegen im Browser
(localStorage) – es gibt keine Datenbank und keinen Login.

Eingabe (alles im selben Feld):

| Quelle | Beispiel |
|---|---|
| Bluesky | `esa.int`, `jemand.bsky.social`, `bsky.app/profile/…` |
| Mastodon | `@eff@mastodon.social`, `https://server.tld/@name` |
| Reddit | `r/EarthPorn`, Subreddit-URL |

Woran die App die Quelle erkennt: Eine Mastodon-Adresse hat zwei Teile mit `@`
dazwischen, ein Bluesky-Handle ist eine Adresse mit Punkt, ein Subreddit
beginnt mit `r/`. Passt eine Eingabe zu keiner Quelle, sagt die App das.

**X (Twitter) wird nicht mehr unterstützt.** X war nur über öffentliche
Nitter-Spiegel lesbar, und davon funktioniert keiner mehr – die Quelle ist
deshalb komplett entfernt.

## Tempo

* **Jede geladene Quelle bleibt im Browser gemerkt** (`iw_cache_<kanal>` in
  localStorage, siehe `src/app/image-cache.ts`). Beim nächsten Öffnen sind die
  Bilder sofort da; frische werden im Hintergrund geholt und ersetzen sie
  still. Wurde eine Quelle vor weniger als 5 Minuten geholt, wird sie gar nicht
  erst gefragt. Gespeichert werden nur Adressen – vier Quellen mit 365 Bildern
  sind 116 KB, 20 Quellen also rund 600 KB (Grenze des Browsers: ~5 MB).
  Das funktioniert nur, weil `i.redd.it`, `cdn.bsky.app` und die
  Mastodon-Server unsignierte Adressen ohne Ablaufdatum liefern.
* **In der Wall View laufen 5 Quellen gleichzeitig** statt eine nach der
  anderen, und jede erscheint, sobald sie da ist; die Fußleiste zeigt den
  Fortschritt. Gemessen mit vier Konten: erstes Bild nach 289 ms, alles fertig
  nach 607 ms. Vorher erschien überhaupt nichts, bis die letzte Quelle
  geantwortet hatte (rund 420 ms je Konto, bei 20 Konten also ~8 s).

## Bildgrößen

* **Kleine Bilder fliegen raus.** Alles, dessen längste Kante unter 400 px
  liegt, kommt gar nicht erst an die Wand – das sind Symbole, Logos und
  Briefmarken. Bluesky und Mastodon nennen die Maße vorab (`aspectRatio` bzw.
  `meta.original`), dort wird vor dem Laden gefiltert; Reddit nennt sie nicht,
  dort greift der Filter beim Ankommen des Bildes.
* **Große Bilder laufen im Raster mit 700 px Breite.** Eine Rasterspalte ist
  rund 270 px breit; ein 4000-px-Original wäre reine Verschwendung
  (Reddit: im Schnitt 915 KB voll gegen 95 KB verkleinert). Bluesky (`thumb`,
  1000 px) und Mastodon (`preview_url`, ~600 px) liefern fertige Fassungen
  mit, Reddit läuft über `images.weserv.nl` (`&we` verhindert, dass kleine
  Bilder aufgeblasen werden).
* **Das Original bleibt erhalten.** Großansicht, der Download-Knopf an jedem
  Bild und das Favoriten-ZIP holen immer die unveränderte Datei der Quelle.

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
  image-item.ts        gemeinsame Typen (ImageItem, SourceAdapter), Größenfilter
  rss2json.ts          Helfer für api.rss2json.com (nur noch Reddits Notausgang)
  index.ts             Verzeichnis aller Quellen
  bluesky/bluesky.source.ts Bluesky, direkt aus dem Browser
  mastodon/mastodon.source.ts Mastodon, direkt aus dem Browser
  reddit/reddit.source.ts   Reddit über den eigenen Vermittler (worker/)
```

## Hinweise

- Reddits Feed lässt sich nicht direkt aus dem Browser lesen (kein
  CORS-Header), deshalb der eigene Vermittler. Die Fußleiste zeigt für jede
  Quelle an, ob sie gerade erreichbar ist (Klick darauf prüft sofort neu).
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
- Der Download (einzelnes Bild wie auch Favoriten-ZIP) holt immer das
  Original. Reddit und Bluesky verbieten das Laden per JavaScript auf ihren
  Bild-Servern, deshalb laufen deren Bilder dafür über den Bild-Weiterleiter
  `images.weserv.nl`; Mastodon erlaubt es direkt.
