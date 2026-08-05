# Reddit-Vermittler (Cloudflare Worker)

Ein winziges Programm, das zwischen der Seite und Reddit sitzt.

**Wozu?** Der Browser darf Reddit nicht direkt fragen. Der bisherige Umweg lief
über den Gratis-Dienst `rss2json`, und der gibt nur **10 Beiträge** pro Feed
heraus — daher die 10 Bilder pro Subreddit. Reddits eigener Feed liefert bis zu
100. Dieser Vermittler holt ihn selbst und reicht nur noch die Bild-Adressen
weiter: **bis zu 100 statt 10 Bilder**, ohne Anmeldung und ohne Schlüssel.
Die Seite fragt 100 an; ohne `limit` sind es 50.

Nebenbei rechnet er kleine Vorschaubilder auf die Originalgröße um und wirft
Doppelte raus.

## Aufruf

```
GET /reddit?sub=EarthPorn&limit=50
```

```json
{ "subreddit": "EarthPorn", "count": 50, "images": [{ "url": "https://i.redd.it/…" }] }
```

Antwortet auf alle Pfade; nur `sub` zählt. Fehler kommen als HTTP 400 (kein
Subreddit), 403 (Anfrage kam nicht von image-wall, siehe unten) oder 502
(Reddit hat nicht geliefert).

## Deployen

Auf [dash.cloudflare.com](https://dash.cloudflare.com) einen Token anlegen:
*My Profile → API Tokens → Create Token → Vorlage „Edit Cloudflare Workers"*.
Dann:

```bash
cd ~/repos/image-wall/worker && CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

Danach steht die Adresse in der Ausgabe (`https://image-wall-reddit.<name>.workers.dev`).

Der Token gehört **nirgends hineingeschrieben** – nicht ins Repo, nicht in eine
Datei, nicht in den Chat. Er wird nur für den einen Befehl gebraucht; danach
kann er im Dashboard gelöscht werden. Ist er einmal irgendwo sichtbar gewesen:
im Dashboard bei dem Token *Roll* (neuer Wert, gleiche Rechte) oder *Delete*.

## Zu wissen

- **Freikontingent:** 100.000 Abrufe pro Tag.
- **Nur für die eigene Seite:** Der Vermittler beantwortet ausschließlich
  Anfragen, die von einer Adresse in `ALLOWED_ORIGINS` kommen (`src/index.js`);
  alles andere bekommt 403. Das ist keine Sperre gegen Menschen – die Seite
  selbst steht jedem offen – sondern verhindert, dass **fremde Webseiten** den
  Vermittler in ihr Projekt einbauen und das Tageskontingent aufbrauchen. Ein
  Programm außerhalb eines Browsers kann die Herkunft fälschen; gegen
  Trittbrettfahrer im Netz reicht es trotzdem. Neue Adresse (z. B. eine eigene
  Domain) → in `ALLOWED_ORIGINS` eintragen und neu deployen.
- **Zwischenspeicher:** Antworten gelten 5 Minuten. Das schont Reddit und
  verhindert, dass viele Besucher dieselbe Abfrage gleichzeitig auslösen.
- **Reddit drosselt nach IP.** Sollte der Vermittler dauerhaft
  „Reddit hat keinen Feed geliefert" melden, teilen sich zu viele fremde
  Anfragen dieselbe Cloudflare-Adresse. Dann hilft ein kostenloser
  Reddit-Anwendungsschlüssel: der zählt aufs eigene Konto statt auf die IP und
  erlaubt 100 Anfragen pro Minute (dann läuft der Abruf über
  `oauth.reddit.com` statt über den Feed).
