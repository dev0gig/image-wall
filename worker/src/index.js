/**
 * Vermittler für Reddit-Bilder (Cloudflare Worker).
 *
 * Warum es den gibt: Ein Browser darf Reddit nicht direkt fragen (Reddit
 * erlaubt fremden Seiten den Zugriff nicht). Der bisherige Ausweg lief über
 * den Gratis-Dienst rss2json, und der gibt nur 10 Beiträge pro Feed heraus.
 * Reddits eigener Feed liefert bis zu 100 - dieser Vermittler holt ihn selbst
 * und reicht nur noch die reinen Bild-Adressen weiter.
 *
 * Aufruf:  /reddit?sub=EarthPorn&limit=50
 * Antwort: {"subreddit":"EarthPorn","images":[{"url":"https://i.redd.it/..."}]}
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Reddit will wissen, wer fragt - ohne eigenen Namen wird schneller gesperrt. */
const USER_AGENT = 'image-wall/1.0 (+https://dev0gig.github.io/image-wall/)';

/** So lange darf eine Antwort zwischengespeichert werden (Sekunden). */
const CACHE_SECONDS = 300;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      ...CORS
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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Nur GET.' }, 405);
    }

    const url = new URL(request.url);

    // Subreddit-Namen bestehen nur aus Buchstaben, Ziffern und Unterstrich -
    // alles andere fliegt raus, damit hier niemand eine andere Adresse
    // untergeschoben bekommt.
    const sub = (url.searchParams.get('sub') || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!sub) {
      return json({ error: 'Kein Subreddit angegeben (?sub=EarthPorn).' }, 400);
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
      return json({ error: 'Reddit war nicht erreichbar.' }, 502);
    }

    if (!response.ok) {
      return json(
        { error: `Reddit antwortet mit ${response.status}.`, status: response.status },
        502
      );
    }

    const xml = await response.text();

    // Wird Reddit die Anfrage zu viel, antwortet es auch schon mal mit einem
    // freundlichen 200 und einem leeren Rumpf. Das ist kein "keine Bilder".
    if (!xml.includes('<entry>')) {
      return json({ error: 'Reddit hat keinen Feed geliefert (vermutlich gedrosselt).' }, 502);
    }

    const images = extractImages(xml).slice(0, limit);
    return json({ subreddit: sub, count: images.length, images });
  }
};
