/**
 * Quelle: X (frueher Twitter), gelesen ueber eine Nitter-Instanz.
 *
 * Nitter stellt zu jedem Konto einen RSS-Feed bereit; darin stecken die Bilder
 * als <img>-Tags. Ein Beitrag kann mehrere Bilder enthalten, deshalb reichen
 * die 10 Feed-Eintraege von rss2json meist fuer 20 Bilder.
 */

import { ImageItem, SourceAdapter } from '../image-item';
import { fetchFeedItems } from '../rss2json';

const NITTER = 'https://nitter.net';
const MAX_IMAGES = 20;

/** Entfernt @, Profil-URLs und angehaengte Pfade wie /media. */
function handleFrom(input: string): string {
  let handle = input.trim();
  if (handle.includes('x.com/')) handle = handle.split('x.com/')[1];
  if (handle.includes('twitter.com/')) handle = handle.split('twitter.com/')[1];
  if (handle.startsWith('@')) handle = handle.substring(1);
  return handle.split('/')[0];
}

export const xSource: SourceAdapter = {
  id: 'x',
  maxImages: MAX_IMAGES,

  // X ist die Standardquelle: alles, was nicht nach einer anderen Quelle
  // aussieht, landet hier. Die Reihenfolge in der Registry sorgt dafuer.
  accepts: () => true,
  owns: () => true,

  normalize: handleFrom,

  label: (channel: string) => `@${channel}`,

  async fetchImages(channel: string): Promise<ImageItem[]> {
    const items = await fetchFeedItems(`${NITTER}/${channel}/rss`);
    const images: ImageItem[] = [];

    for (const item of items) {
      const html = item.content || item.description || '';
      const regex = /<img[^>]+src="([^">]+)"/gi;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const url = match[1].replace(/&amp;/g, '&');
        images.push({ url, channel });
        if (images.length >= MAX_IMAGES) return images;
      }
    }

    return images;
  },

  /**
   * Nitter-Bild-URLs (https://nitter.net/pic/media%2Fabc.jpg) zeigen auf X.
   * Nitter selbst erlaubt kein Herunterladen per JavaScript (kein CORS-Header),
   * pbs.twimg.com dagegen schon. Darum bauen wir die Original-URL zurueck.
   */
  toDownloadableUrl(url: string): string {
    const marker = '/pic/';
    const idx = url.indexOf(marker);
    if (idx === -1) return url;

    const raw = decodeURIComponent(url.substring(idx + marker.length));
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return `https://pbs.twimg.com/${raw.replace(/^\/+/, '')}`;
  }
};
