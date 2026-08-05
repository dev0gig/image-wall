/**
 * Quelle: Reddit, gelesen ueber den oeffentlichen RSS-Feed eines Subreddits.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 * 1. Der **eigene Vermittler** (Cloudflare Worker, siehe `worker/`). Er holt
 *    Reddits Feed direkt und liefert bis zu 100 Bilder. Auch Subreddits, die
 *    rss2json nicht durchreicht, kommen nur ueber diesen Weg an.
 * 2. Faellt der aus, der alte Weg ueber **rss2json** - dann eben nur 10 Bilder,
 *    weil der Dienst ohne API-Schluessel nicht mehr Beitraege herausgibt.
 *
 * Reddits eigene JSON-API scheidet aus: Sie antwortet Besuchern ohne Anmeldung
 * mit 403 und schickt keinen CORS-Header, ist aus dem Browser also unerreichbar.
 */

import { ImageItem, SourceAdapter } from '../image-item';
import { fetchFeedItems } from '../rss2json';

/** Eigener Vermittler - Quelltext und Anleitung liegen im Ordner `worker/`. */
const WORKER_URL = 'https://image-wall-reddit.image-wall-reddit.workers.dev/reddit';

const MAX_IMAGES = 100;

/** Grosses, immer gefuelltes Subreddit - nur fuer die Erreichbarkeitspruefung. */
const PROBE = 'EarthPorn';

/** Reddit liefert den ersten Abruf eines Feeds oft nicht - dann nochmal fragen. */
const ATTEMPTS = 3;

const IMAGE_HOSTS = /^https?:\/\/([a-z0-9-]+\.)*(redd\.it|redditmedia\.com)\//i;
const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp)(\?|$)/i;

/** Holt aus `r/Name`, `/r/Name`, `Name` oder einer Reddit-URL den reinen Namen. */
function subredditFrom(input: string): string {
  const trimmed = input.trim();

  const fromUrl = trimmed.match(/reddit\.com\/r\/([^/?#\s]+)/i);
  if (fromUrl) return fromUrl[1];

  return trimmed.replace(/^\/?r\//i, '').split(/[/?#\s]/)[0];
}

function isImage(url: string): boolean {
  return IMAGE_HOSTS.test(url) || IMAGE_EXTENSION.test(url);
}

/**
 * Vorschaubilder auf Originalgroesse bringen.
 *
 * `preview.redd.it/<id>.jpg?width=140&...` und `i.redd.it/<id>.jpg` sind
 * dieselbe Datei - nur einmal klein zurechtgeschnitten und einmal im Original.
 * Die Groesse laesst sich in der Vorschau-Adresse nicht aendern (die Adresse
 * ist unterschrieben), der Umweg ueber i.redd.it funktioniert dagegen.
 * Nur fuer `preview.redd.it` - `external-preview.redd.it` zeigt Bilder von
 * fremden Seiten, die es auf i.redd.it nicht gibt.
 */
function toFullSize(url: string): string {
  const match = url.match(/^https?:\/\/preview\.redd\.it\/([^/?#]+\.(?:jpe?g|png|gif|webp))(\?|$)/i);
  return match ? `https://i.redd.it/${match[1]}` : url;
}

/**
 * Sucht das beste Bild eines Feed-Eintrags.
 *
 * Im Feed steht das Vorschaubild (preview.redd.it, 640 px breit) als <img>,
 * das Originalbild dagegen als "[link]" auf i.redd.it. Wir nehmen bevorzugt
 * das Original und fallen sonst auf die Vorschau zurueck.
 */
function pickImage(html: string, thumbnail?: string): string | null {
  const original = html.match(/href="(https?:\/\/i\.redd\.it\/[^"]+)"/i);
  if (original) return original[1].replace(/&amp;/g, '&');

  const preview = html.match(/<img[^>]+src="([^">]+)"/i);
  if (preview) {
    const url = preview[1].replace(/&amp;/g, '&');
    if (isImage(url)) return toFullSize(url);
  }

  if (thumbnail) {
    const url = thumbnail.replace(/&amp;/g, '&');
    if (isImage(url)) return toFullSize(url);
  }

  return null;
}

/** Weg 1: eigener Vermittler - bis zu 100 Bilder. */
async function fetchViaWorker(subreddit: string, channel: string): Promise<ImageItem[]> {
  const url = `${WORKER_URL}?sub=${encodeURIComponent(subreddit)}&limit=${MAX_IMAGES}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data?.images)) {
    throw new Error(data?.error || 'Der Reddit-Vermittler antwortet gerade nicht.');
  }

  return data.images.map((image: { url: string }) => ({ url: image.url, channel }));
}

/** Weg 2 (Notausgang): der alte Umweg ueber rss2json - hoechstens 10 Bilder. */
async function fetchViaRss2json(subreddit: string, channel: string): Promise<ImageItem[]> {
  const items = await fetchFeedItems(`https://www.reddit.com/r/${subreddit}/.rss`, 'Reddit', ATTEMPTS);

  const images: ImageItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const html = item.content || item.description || '';
    const url = pickImage(html, item.thumbnail);

    if (!url || seen.has(url)) continue;

    seen.add(url);
    images.push({ url, channel });
    if (images.length >= MAX_IMAGES) break;
  }

  return images;
}

export const redditSource: SourceAdapter = {
  id: 'reddit',
  displayName: 'Reddit',
  maxImages: MAX_IMAGES,

  accepts: (input: string) => {
    const trimmed = input.trim();
    return /^\/?r\//i.test(trimmed) || /reddit\.com\/r\//i.test(trimmed);
  },

  owns: (channel: string) => channel.startsWith('r/'),

  normalize: (input: string) => {
    const name = subredditFrom(input);
    // Ohne Namen (z. B. nur "r/") gibt es nichts zu laden.
    return name ? `r/${name}` : '';
  },

  // Der gespeicherte Name enthaelt das "r/" bereits.
  label: (channel: string) => channel,

  async fetchImages(channel: string): Promise<ImageItem[]> {
    const subreddit = subredditFrom(channel);

    try {
      const images = await fetchViaWorker(subreddit, channel);
      if (images.length > 0) return images;
    } catch {
      // Vermittler streikt - unten kommt der Notausgang.
    }

    return fetchViaRss2json(subreddit, channel);
  },

  async checkAvailability(): Promise<boolean> {
    try {
      const images = await this.fetchImages(`r/${PROBE}`);
      return images.length > 0;
    } catch {
      return false;
    }
  },

  /**
   * i.redd.it und preview.redd.it liefern Bilder zwar an <img>-Tags aus,
   * verbieten aber das Laden per JavaScript (kein CORS-Header). Fuer das
   * Favoriten-ZIP schicken wir sie deshalb ueber den Bild-Weiterleiter
   * images.weserv.nl, der das ausdruecklich erlaubt.
   */
  toDownloadableUrl(url: string): string {
    const withoutScheme = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${encodeURIComponent(withoutScheme)}`;
  }
};
