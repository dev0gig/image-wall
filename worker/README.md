# Reddit- und Pinterest-Vermittler (Cloudflare Worker)

Ein winziges Programm, das zwischen der Seite und Reddit bzw. Pinterest sitzt.

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
GET /reddit?sub=itookapicture&limit=50
```

```json
{ "subreddit": "itookapicture", "count": 50, "images": [{ "url": "https://i.redd.it/…" }] }
```

```
GET /pinterest?user=name&board=pinnwand
```

```json
{ "user": "name", "board": "pinnwand", "count": 25, "images": [{ "url": "https://i.pinimg.com/originals/…", "preview": "https://i.pinimg.com/736x/…" }] }
```

`board` ist freiwillig; ohne kommt der Feed des ganzen Kontos. Pinterests Feed
nennt nur die 236-px-Fassung und immer `.jpg`. Der Vermittler prüft deshalb, unter
welcher Endung das Original liegt. Das kostet Abrufe, und der Gratis-Tarif erlaubt
50 pro Anfrage: Reicht das nicht, kommt die 1200-px-Fassung statt des Originals.

`/pinterest` ist der einzige eigene Pfad, alle übrigen meinen Reddit und nur `sub`
zählt. Fehler kommen als HTTP 400 (kein
Subreddit bzw. Konto), 403 (Anfrage kam nicht von image-wall, siehe unten) oder
502 (Reddit bzw. Pinterest hat nicht geliefert).

## Deployen

Auf [dash.cloudflare.com](https://dash.cloudflare.com) einen Token anlegen:
*My Profile → API Tokens → Create Token → Vorlage „Edit Cloudflare Workers"*.
Dann:

```bash
set -a; . ~/.config/secrets/cloudflare.env; set +a; cd ~/repos/image-wall/worker && npx wrangler deploy
```

Danach steht die Adresse in der Ausgabe (`https://image-wall-reddit.<name>.workers.dev`).

Der Token liegt auf odin nur in `~/.config/secrets/cloudflare.env` (Rechte `600`,
außerhalb des Repos) und gehört weder ins Repo noch in den Chat. Ist er einmal
irgendwo sichtbar gewesen: im Dashboard bei dem Token *Roll* (neuer Wert, gleiche
Rechte) oder *Delete*.

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
- **Zwischenspeicher: 15 Minuten.** Die wichtigste Rücksicht gegenüber Reddit –
  egal wie viele Leute dasselbe Subreddit anschauen, Reddit wird höchstens
  einmal pro Viertelstunde gefragt. Neue Beiträge erscheinen dadurch bis zu
  15 Minuten später; für eine Bilderwand ist das ohne Belang.
- **Wir sagen, wer wir sind:** Jede Anfrage an Reddit trägt einen eigenen
  Namen samt Adresse der Seite (`USER_AGENT` in `src/index.js`). Genau das
  wünscht Reddit sich; namenlose Abrufe werden eher gedrosselt.
- **Reddit drosselt nach IP.** Sollte der Vermittler dauerhaft
  „Reddit hat keinen Feed geliefert" melden, teilen sich zu viele fremde
  Anfragen dieselbe Cloudflare-Adresse. Dann hilft ein kostenloser
  Reddit-Anwendungsschlüssel: der zählt aufs eigene Konto statt auf die IP und
  erlaubt 100 Anfragen pro Minute (dann läuft der Abruf über
  `oauth.reddit.com` statt über den Feed).
