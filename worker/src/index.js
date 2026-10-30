/**
 * Vermittler für Reddit- und Pinterest-Bilder (Cloudflare Worker).
 *
 * Warum es den gibt: Ein Browser darf Reddit nicht direkt fragen (Reddit
 * erlaubt fremden Seiten den Zugriff nicht). Der bisherige Ausweg lief über
 * den Gratis-Dienst rss2json, und der gibt nur 10 Beiträge pro Feed heraus.
 * Reddits eigener Feed liefert bis zu 100 - dieser Vermittler holt ihn selbst
 * und reicht nur noch die reinen Bild-Adressen weiter. Für Pinterest gilt
 * dasselbe, dort sind es 25.
 *
 * Aufruf:  /reddit?sub=itookapicture&limit=50
 * Antwort: {"subreddit":"itookapicture","images":[{"url":"https://i.redd.it/..."}]}
 *
 * Aufruf:  /pinterest?user=name&board=pinnwand   (board ist freiwillig)
 * Antwort: {"user":"name","board":"pinnwand","images":[{"url":"https://i.pinimg.com/originals/...","preview":"https://i.pinimg.com/736x/..."}]}
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Reddit will wissen, wer fragt - ohne eigenen Namen wird schneller gesperrt. */
const USER_AGENT = 'image-wall/1.0 (+https://dev0gig.github.io/image-wall/)';

/**
 * So lange darf eine Antwort zwischengespeichert werden (Sekunden).
 *
 * Das ist die wichtigste Ruecksicht gegenueber Reddit: Egal wie viele Leute
 * dasselbe Subreddit anschauen, Reddit wird hoechstens einmal pro Viertelstunde
 * gefragt. Fuer eine Bilderwand reicht das voellig - neue Beitraege sind eben
 * bis zu 15 Minuten spaeter zu sehen.
 */
const CACHE_SECONDS = 900;

/**
 * Nur diese Seiten duerfen den Vermittler benutzen.
 *
 * Das ist kein Schutz gegen Menschen - die Seite selbst steht jedem offen.
 * Es verhindert, dass eine *fremde Webseite* den Vermittler in ihr eigenes
 * Projekt einbaut und das Tageskontingent aufbraucht. Ein Programm ausserhalb
 * eines Browsers kann die Herkunft faelschen; gegen Trittbrettfahrer im Netz
 * reicht es trotzdem.
 */
const ALLOWED_ORIGINS = [
  'https://dev0gig.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

/** Erlaubte Herkunft -> CORS-Kopfzeilen, sonst `null`. */
function corsFor(origin) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    // Ohne `Vary` koennte eine zwischengespeicherte Antwort mit der Erlaubnis
    // fuer die eine Seite an eine andere ausgeliefert werden.
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      ...cors
    }
  });
}

/**
 * Vorschaubild auf Originalgröße bringen: `preview.redd.it/<id>.jpg?...` und
 * `i.redd.it/<id>.jpg` sind dieselbe Datei. `external-preview` bleibt außen
 * vor - solche Bilder liegen nicht auf i.redd.it.
 */
function toFullSize(url) {
  const match = url.match(/^https?:\/\/preview\.redd\.it\/([^/?#]+\.(?:jpe?g|png|gif|webp))(\?|$)/i);
  return match ? `https://i.redd.it/${match[1]}` : url;
}

function isImage(url) {
  return /^https?:\/\/([a-z0-9-]+\.)*(redd\.it|redditmedia\.com)\//i.test(url) ||
    /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
}

/**
 * Im Feed steckt die Beitrags-HTML doppelt maskiert (`&lt;a href=&quot;...`).
 * Diese Ebene muss weg, bevor sich Adressen herauslesen lassen; die zweite
 * Ebene (`&amp;` in der Adresse selbst) wird beim Bild danach aufgelöst.
 */
function unescapeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Aus dem Atom-Feed die Bilder ziehen. Pro Beitrag steht das Originalbild als
 * "[link]" auf i.redd.it, das Vorschaubild als <img>.
 */
function extractImages(xml) {
  const images = [];
  const seen = new Set();

  for (const raw of xml.split('<entry>').slice(1)) {
    const entry = unescapeXml(raw);
    const original = entry.match(/href="(https?:\/\/i\.redd\.it\/[^"]+)"/i);
    const preview = entry.match(/<img[^>]+src="([^">]+)"/i);

    let url = null;
    if (original) {
      url = original[1];
    } else if (preview) {
      const candidate = preview[1].replace(/&amp;/g, '&');
      if (isImage(candidate)) url = toFullSize(candidate);
    }

    if (!url) continue;
    url = url.replace(/&amp;/g, '&');
    if (seen.has(url)) continue;

    seen.add(url);
    images.push({ url });
  }

  return images;
}

/** Cloudflare erlaubt im Gratis-Tarif 50 Abrufe pro Anfrage. */
const MAX_SUBREQUESTS = 50;

/** Endungen, unter denen Pinterest ein Original ablegt, wenn es kein `.jpg` ist. */
const OTHER_EXTENSIONS = ['png', 'webp', 'gif'];

async function exists(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Aus dem Feed die Bildpfade ziehen (`9a/95/b6/<id>`, ohne Größe und Endung). */
function extractPinterestPaths(xml) {
  const paths = new Set();

  for (const raw of xml.split('<item>').slice(1)) {
    const match = unescapeXml(raw).match(/<img[^>]+src="https:\/\/i\.pinimg\.com\/[^/"]+\/([^"]+)\.[a-z]+"/i);
    if (match) paths.add(match[1]);
  }

  return [...paths];
}

/**
 * Der Feed nennt nur die 236-px-Fassung und immer `.jpg`, das Original kann
 * aber auch ein PNG, WebP oder GIF sein - das verrät nur die Nachfrage. Reicht
 * das Abrufkontingent nicht, tut es die 1200-px-Fassung, die es immer gibt.
 */
async function findOriginals(paths) {
  const isJpg = await Promise.all(paths.map(path => exists(`https://i.pinimg.com/originals/${path}.jpg`)));
  let budget = MAX_SUBREQUESTS - 1 - paths.length;

  const images = [];
  for (const [index, path] of paths.entries()) {
    let url = isJpg[index] ? `https://i.pinimg.com/originals/${path}.jpg` : null;

    for (const extension of OTHER_EXTENSIONS) {
      if (url || budget <= 0) break;
      budget -= 1;
      const candidate = `https://i.pinimg.com/originals/${path}.${extension}`;
      if (await exists(candidate)) url = candidate;
    }

    images.push({
      url: url ?? `https://i.pinimg.com/1200x/${path}.jpg`,
      preview: `https://i.pinimg.com/736x/${path}.jpg`
    });
  }

  return images;
}

async function handlePinterest(url, cors) {
  // Wie beim Subreddit: Nur diese Zeichen kommen in die Adresse, damit hier
  // niemand eine andere unterschieben kann.
  const user = (url.searchParams.get('user') || '').replace(/[^A-Za-z0-9_-]/g, '');
  const board = (url.searchParams.get('board') || '').replace(/[^\p{L}\p{N}_-]/gu, '');
  if (!user) {
    return json({ error: 'Kein Konto angegeben (?user=name).' }, 400, cors);
  }

  let response;
  try {
    response = await fetch(`https://www.pinterest.com/${user}/${board ? encodeURIComponent(board) : 'feed'}.rss`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/xml' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
    });
  } catch {
    return json({ error: 'Pinterest war nicht erreichbar.' }, 502, cors);
  }

  if (!response.ok) {
    return json(
      { error: `Pinterest antwortet mit ${response.status}.`, status: response.status },
      502,
      cors
    );
  }

  const xml = await response.text();
  if (!xml.includes('<rss')) {
    return json({ error: 'Pinterest hat keinen Feed geliefert.' }, 502, cors);
  }

  const images = await findOriginals(extractPinterestPaths(xml));
  return json({ user, board, count: images.length, images }, 200, cors);
}

export default {
  async fetch(request) {
    const cors = corsFor(request.headers.get('Origin'));

    // Anfragen von fremden Seiten (oder ganz ohne Herkunft) gar nicht erst
    // beantworten - siehe ALLOWED_ORIGINS.
    if (!cors) {
      return new Response('Dieser Vermittler beantwortet nur Anfragen von image-wall.\n', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Nur GET.' }, 405, cors);
    }

    const url = new URL(request.url);

    if (url.pathname === '/pinterest') {
      return handlePinterest(url, cors);
    }

    // Subreddit-Namen bestehen nur aus Buchstaben, Ziffern und Unterstrich -
    // alles andere fliegt raus, damit hier niemand eine andere Adresse
    // untergeschoben bekommt.
    const sub = (url.searchParams.get('sub') || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!sub) {
      return json({ error: 'Kein Subreddit angegeben (?sub=itookapicture).' }, 400, cors);
    }

    const wanted = Number(url.searchParams.get('limit')) || DEFAULT_LIMIT;
    const limit = Math.min(Math.max(wanted, 1), MAX_LIMIT);

    let response;
    try {
      response = await fetch(`https://www.reddit.com/r/${sub}/.rss?limit=${limit}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml' },
        // Cloudflare hält die Antwort selbst kurz vor - schont Reddit und uns.
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true }
      });
    } catch {
      return json({ error: 'Reddit war nicht erreichbar.' }, 502, cors);
    }

    if (!response.ok) {
      return json(
        { error: `Reddit antwortet mit ${response.status}.`, status: response.status },
        502,
        cors
      );
    }

    const xml = await response.text();

    // Wird Reddit die Anfrage zu viel, antwortet es auch schon mal mit einem
    // freundlichen 200 und einem leeren Rumpf. Das ist kein "keine Bilder".
    if (!xml.includes('<entry>')) {
      return json({ error: 'Reddit hat keinen Feed geliefert (vermutlich gedrosselt).' }, 502, cors);
    }

    const images = extractImages(xml).slice(0, limit);
    return json({ subreddit: sub, count: images.length, images }, 200, cors);
  }
};
