/**
 * Quelle: Pinterest, gelesen ueber den oeffentlichen RSS-Feed eines Kontos oder
 * einer Pinnwand.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 * 1. Der **eigene Vermittler** (Cloudflare Worker, siehe `worker/`). Er liefert
 *    alle 25 Bilder des Feeds und findet die Originale heraus.
 * 2. Faellt der aus, der Umweg ueber **rss2json** - dann nur 10 Bilder und statt
 *    der Originale die 1200-px-Fassung.
 *
 * Mehr als 25 Bilder gibt es nicht: Der Feed kennt kein Weiterblaettern, die
 * interne Schnittstelle antwortet mit 403, und die offizielle API verlangt eine
 * Anmeldung samt App-Pruefung.
 */

import { ImageItem, SourceAdapter } from '../image-item';
import { fetchFeedItems } from '../rss2json';

/** Eigener Vermittler - Quelltext und Anleitung liegen im Ordner `worker/`. */
const WORKER_URL = 'https://image-wall-reddit.image-wall-reddit.workers.dev/pinterest';

const PREFIX = 'pin:';

const MAX_IMAGES = 25;

/** Immer gefuelltes Konto - nur fuer die Erreichbarkeitspruefung. */
const PROBE = 'pinterest';

const PROFILE_URL = /(?:^|\/\/|\.)pinterest\.[a-z.]+\/([^?#\s]+)/i;

/** Diese Pfade sind Seiten von Pinterest selbst, keine Konten. */
const NOT_ACCOUNTS = new Set(['pin', 'search', 'ideas', 'today', 'explore', 'business', 'settings', 'resource']);

const THUMBNAIL = /https:\/\/i\.pinimg\.com\/[^/"]+\/([^"]+)\.[a-z]+/i;

interface Place {
  user: string;
  /** Fehlt bei einem ganzen Konto. */
  board?: string;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/**
 * Holt Konto und Pinnwand aus `pin:name/pinnwand` oder einer Pinterest-URL.
 * `null`, wenn es kein Konto ist (z. B. die Adresse eines einzelnen Pins).
 */
function placeFrom(input: string): Place | null {
  const trimmed = input.trim();
  const path = trimmed.toLowerCase().startsWith(PREFIX)
    ? trimmed.slice(PREFIX.length)
    : trimmed.match(PROFILE_URL)?.[1];
  if (!path) return null;

  const [user, rawBoard] = path.split('/').filter(Boolean).map(part => decode(part).toLowerCase());
  if (!user || NOT_ACCOUNTS.has(user) || !/^[a-z0-9_-]+$/.test(user)) return null;

  // Reiter wie `_saved` und die Feed-Adresse selbst meinen das ganze Konto.
  const board = rawBoard?.replace(/\.rss$/, '');
  if (!board || board.startsWith('_') || board === 'feed') return { user };

  return /^[\p{L}\p{N}_-]+$/u.test(board) ? { user, board } : null;
}

function feedUrl(place: Place): string {
  const name = place.board ? encodeURIComponent(place.board) : 'feed';
  return `https://www.pinterest.com/${place.user}/${name}.rss`;
}

/** Weg 1: eigener Vermittler - alle 25 Bilder, in Originalgroesse. */
async function fetchViaWorker(place: Place, channel: string): Promise<ImageItem[]> {
  const params = new URLSearchParams({ user: place.user });
  if (place.board) params.set('board', place.board);

  const response = await fetch(`${WORKER_URL}?${params}`);
  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data?.images)) {
    throw new Error(data?.error || 'Der Pinterest-Vermittler antwortet gerade nicht.');
  }

  return data.images.map((image: { url: string; preview: string }) => ({
    url: image.url,
    preview: image.preview,
    channel
  }));
}

/**
 * Weg 2 (Notausgang): rss2json - hoechstens 10 Bilder. Der Feed nennt nur die
 * 236-px-Fassung. Die Endung des Originals laesst sich aus dem Browser nicht
 * pruefen, deshalb die 1200-px-Fassung, die es immer als `.jpg` gibt.
 */
async function fetchViaRss2json(place: Place, channel: string): Promise<ImageItem[]> {
  const items = await fetchFeedItems(feedUrl(place), 'Pinterest');

  const images: ImageItem[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const path = (item.content || item.description || item.thumbnail || '').match(THUMBNAIL)?.[1];
    if (!path || seen.has(path)) continue;

    seen.add(path);
    images.push({
      url: `https://i.pinimg.com/1200x/${path}.jpg`,
      preview: `https://i.pinimg.com/736x/${path}.jpg`,
      channel
    });
  }

  return images;
}

export const pinterestSource: SourceAdapter = {
  id: 'pinterest',
  displayName: 'Pinterest',
  maxImages: MAX_IMAGES,

  accepts: (input: string) => placeFrom(input) !== null,

  owns: (channel: string) => channel.toLowerCase().startsWith(PREFIX),

  normalize: (input: string) => {
    const place = placeFrom(input);
    if (!place) return '';
    return `${PREFIX}${place.user}${place.board ? `/${place.board}` : ''}`;
  },

  // Der gespeicherte Name ist zugleich gut lesbar.
  label: (channel: string) => channel,

  async fetchImages(channel: string): Promise<ImageItem[]> {
    const place = placeFrom(channel);
    if (!place) throw new Error(`„${channel}" ist kein Pinterest-Konto.`);

    try {
      const images = await fetchViaWorker(place, channel);
      if (images.length > 0) return images;
    } catch {
      // Vermittler streikt - unten kommt der Notausgang.
    }

    return fetchViaRss2json(place, channel);
  },

  async checkAvailability(): Promise<boolean> {
    try {
      const images = await this.fetchImages(`${PREFIX}${PROBE}`);
      return images.length > 0;
    } catch {
      return false;
    }
  },

  /** `i.pinimg.com` verbietet das Laden per JavaScript (kein CORS-Header). */
  toDownloadableUrl(url: string): string {
    const withoutScheme = url.replace(/^https?:\/\//, '');
    return `https://images.weserv.nl/?url=${encodeURIComponent(withoutScheme)}`;
  }
};
