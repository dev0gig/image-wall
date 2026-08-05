/**
 * Quelle: Reddit, gelesen ueber den oeffentlichen RSS-Feed eines Subreddits.
 *
 * Warum RSS und nicht die Reddit-API? Die JSON-API (`/r/<sub>/hot.json`)
 * antwortet Besuchern ohne Anmeldung mit 403 und schickt ausserdem keinen
 * CORS-Header - aus einer Web-App ist sie damit nicht erreichbar. Der
 * RSS-Feed funktioniert, muss aber ueber rss2json geholt werden.
 *
 * Folge: pro Subreddit gibt es hoechstens 10 Bilder, weil rss2json ohne
 * API-Schluessel nur 10 Beitraege herausgibt und ein Reddit-Beitrag im Feed
 * genau ein Bild mitbringt.
 */

import { ImageItem, SourceAdapter } from '../image-item';
import { fetchFeedItems } from '../rss2json';

const MAX_IMAGES = 10;

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
  },

  async checkAvailability(): Promise<boolean> {
    try {
      const items = await fetchFeedItems(`https://www.reddit.com/r/${PROBE}/.rss`, 'Reddit', ATTEMPTS);
      return items.length > 0;
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
