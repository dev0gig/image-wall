/**
 * Quelle: Bluesky.
 *
 * Die angenehmste Quelle von allen: Bluesky hat eine oeffentliche
 * Schnittstelle, die auch fremde Seiten abfragen duerfen (CORS erlaubt).
 * Es braucht also weder einen Vermittler noch einen Schluessel noch eine
 * Anmeldung - der Browser des Besuchers fragt direkt an.
 *
 * Ausserdem kennt sie einen Filter fuer "nur Beitraege mit Medien". Der Text
 * faellt damit schon auf dem Server weg, und ein einziger Abruf liefert bis zu
 * 100 Bilder.
 *
 * Kanaele werden als `bsky:<handle>` gespeichert, damit sie sich von
 * X-Konten unterscheiden lassen.
 */

import { ImageItem, SourceAdapter } from '../image-item';

const API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const MAX_IMAGES = 100;

/** Bekanntes Konto - nur fuer die Erreichbarkeitspruefung. */
const PROBE = 'bsky.app';

const PREFIX = 'bsky:';

/** Bluesky-Handles sind Adressen: `nasa.gov`, `jemand.bsky.social`. */
const HANDLE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Holt aus `bsky:name`, `@name`, `name.bsky.social` oder einer Profil-URL den Handle. */
function handleFrom(input: string): string {
  let handle = input.trim();

  const fromUrl = handle.match(/bsky\.app\/profile\/([^/?#\s]+)/i);
  if (fromUrl) return fromUrl[1];

  if (handle.toLowerCase().startsWith(PREFIX)) handle = handle.slice(PREFIX.length);
  if (handle.startsWith('@')) handle = handle.slice(1);

  return handle.split(/[/?#\s]/)[0];
}

/**
 * Sammelt die Bilder eines Beitrags.
 *
 * Bluesky kennt dafuer mehrere Formen: einzelne Bilder (`images`), Galerien
 * (`items`) und zitierte Beitraege mit Medien (`media`). Videos bleiben
 * aussen vor - hier sollen nur Bilder an die Wand.
 */
function imagesFrom(embed: Record<string, unknown> | undefined): string[] {
  if (!embed) return [];

  const found: string[] = [];
  const list = (embed['images'] ?? embed['items']) as { fullsize?: string }[] | undefined;

  if (Array.isArray(list)) {
    for (const image of list) {
      if (image?.fullsize) found.push(image.fullsize);
    }
  }

  // Zitierter Beitrag mit Medien: die Bilder haengen eine Ebene tiefer.
  const media = embed['media'] as Record<string, unknown> | undefined;
  if (media) found.push(...imagesFrom(media));

  return found;
}

function explain(message: string | undefined, handle: string): string {
  if (message && /profile not found|could not resolve/i.test(message)) {
    return `Das Bluesky-Konto @${handle} gibt es nicht.`;
  }
  return 'Bluesky antwortet gerade nicht.';
}

async function fetchFeed(handle: string, limit: number): Promise<{ post: { embed?: Record<string, unknown> } }[]> {
  const url = `${API}?actor=${encodeURIComponent(handle)}&limit=${limit}&filter=posts_with_media`;
  const response = await fetch(url);
  const data = await response.json().catch(() => null);

  if (!response.ok || !Array.isArray(data?.feed)) {
    throw new Error(explain(data?.message, handle));
  }

  return data.feed;
}

export const blueskySource: SourceAdapter = {
  id: 'bluesky',
  displayName: 'Bluesky',
  maxImages: MAX_IMAGES,

  accepts: (input: string) => {
    const trimmed = input.trim();

    if (trimmed.toLowerCase().startsWith(PREFIX)) return true;
    if (/bsky\.app\/profile\//i.test(trimmed)) return true;

    // Profil-URLs anderer Dienste gehoeren deren Quellen.
    if (/(x|twitter)\.com\//i.test(trimmed) || /reddit\.com\//i.test(trimmed)) return false;

    // Ein X-Handle wie `ArchDigest` hat keinen Punkt, ein Bluesky-Handle immer.
    return HANDLE.test(trimmed.replace(/^@/, ''));
  },

  owns: (channel: string) => channel.toLowerCase().startsWith(PREFIX),

  normalize: (input: string) => {
    const handle = handleFrom(input);
    return handle ? `${PREFIX}${handle}` : '';
  },

  label: (channel: string) => `@${handleFrom(channel)}`,

  async fetchImages(channel: string): Promise<ImageItem[]> {
    const handle = handleFrom(channel);
    const feed = await fetchFeed(handle, MAX_IMAGES);

    const images: ImageItem[] = [];
    const seen = new Set<string>();

    for (const entry of feed) {
      for (const url of imagesFrom(entry.post?.embed)) {
        if (seen.has(url)) continue;

        seen.add(url);
        images.push({ url, channel });
        if (images.length >= MAX_IMAGES) return images;
      }
    }

    return images;
  },

  async checkAvailability(): Promise<boolean> {
    try {
      const feed = await fetchFeed(PROBE, 1);
      return feed.length > 0;
    } catch {
      return false;
    }
  },

  /**
   * Bluesky zeigt seine Bilder jeder Seite an, erlaubt aber kein Herunterladen
   * per JavaScript (kein CORS-Header auf cdn.bsky.app). Fuers Favoriten-ZIP
   * gehen sie deshalb ueber denselben Bild-Weiterleiter wie die Reddit-Bilder.
   */
  toDownloadableUrl(url: string): string {
    return `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}`;
  }
};
