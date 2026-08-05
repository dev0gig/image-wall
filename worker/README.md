# Reddit-Vermittler (Cloudflare Worker)

Ein winziges Programm, das zwischen der Seite und Reddit sitzt.

**Wozu?** Der Browser darf Reddit nicht direkt fragen. Der bisherige Umweg lief
über den Gratis-Dienst `rss2json`, und der gibt nur **10 Beiträge** pro Feed
heraus — daher die 10 Bilder pro Subreddit. Reddits eigener Feed liefert bis zu
100. Dieser Vermittler holt ihn selbst und reicht nur noch die Bild-Adressen
weiter: **50 statt 10 Bilder**, ohne Anmeldung und ohne Schlüssel.

Nebenbei rechnet er kleine Vorschaubilder auf die Originalgröße um und wirft
Doppelte raus.

## Aufruf

```
GET /reddit?sub=EarthPorn&limit=50
```

```json
{ "subreddit": "EarthPorn", "count": 50, "images": [{ "url": "https://i.redd.it/…" }] }
```

Antwortet auf alle Adressen; nur `sub` zählt. Fehler kommen als HTTP 400
(kein Subreddit) oder 502 (Reddit hat nicht geliefert).

## Deployen

Einmalig auf [dash.cloudflare.com](https://dash.cloudflare.com) einen Token
anlegen: *My Profile → API Tokens → Create Token → Vorlage „Edit Cloudflare
Workers"*. Dann:

```bash
cd ~/repos/image-wall/worker && CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

Danach steht die Adresse in der Ausgabe (`https://image-wall-reddit.<name>.workers.dev`).

## Zu wissen

- **Freikontingent:** 100.000 Abrufe pro Tag.
- **Offen für alle** (`Access-Control-Allow-Origin: *`): Jeder darf den
  Vermittler benutzen. Soll das nur die eigene Seite dürfen, in `src/index.js`
  bei `CORS` das `*` durch die Adresse der Seite ersetzen.
- **Zwischenspeicher:** Antworten gelten 5 Minuten. Das schont Reddit und
  verhindert, dass viele Besucher dieselbe Abfrage gleichzeitig auslösen.
- **Reddit drosselt nach IP.** Sollte der Vermittler dauerhaft
  „Reddit hat keinen Feed geliefert" melden, teilen sich zu viele fremde
  Anfragen dieselbe Cloudflare-Adresse. Dann hilft ein kostenloser
  Reddit-Anwendungsschlüssel: der zählt aufs eigene Konto statt auf die IP und
  erlaubt 100 Anfragen pro Minute (dann läuft der Abruf über
  `oauth.reddit.com` statt über den Feed).
