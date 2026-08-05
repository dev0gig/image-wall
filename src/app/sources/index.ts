/**
 * Verzeichnis aller Bild-Quellen.
 *
 * Die Oberflaeche spricht nur mit den Funktionen hier unten und muss nicht
 * wissen, ob ein Kanal von Reddit, Bluesky oder Mastodon kommt. Eine neue
 * Quelle braucht nur einen eigenen Unterordner mit ihrem Adapter und einen
 * Eintrag in `SOURCES`.
 */

import { blueskySource } from './bluesky/bluesky.source';
import { ImageItem, SourceAdapter } from './image-item';
import { mastodonSource } from './mastodon/mastodon.source';
import { redditSource } from './reddit/reddit.source';

export { MIN_EDGE, isBigEnough, type ImageItem, type SourceAdapter, type SourceId } from './image-item';

export const SOURCES: readonly SourceAdapter[] = [redditSource, mastodonSource, blueskySource];

/**
 * Welche Quelle ist gemeint, wenn der Nutzer `input` eintippt? `null`, wenn
 * die Eingabe zu keiner passt - frueher landete alles Uebrige bei X, das es
 * nicht mehr gibt.
 */
export function sourceForInput(input: string): SourceAdapter | null {
  return SOURCES.find(source => source.accepts(input)) ?? null;
}

/**
 * Zu welcher Quelle gehoert ein gespeicherter Kanalname? `null` z. B. bei
 * alten X-Eintraegen, die noch in der gespeicherten Liste stehen koennen.
 */
export function sourceForChannel(channel: string): SourceAdapter | null {
  return SOURCES.find(source => source.owns(channel)) ?? null;
}

/** Erklaert in einem Satz, was die Seite ueberhaupt annimmt. */
export const INPUT_HELP =
  'Das konnte ich keiner Quelle zuordnen. Erlaubt sind: ein Subreddit (r/EarthPorn), ' +
  'ein Bluesky-Konto (esa.int) oder ein Mastodon-Konto (@eff@mastodon.social).';

/** Eingabe -> gespeicherter Kanalname, oder '' wenn nichts passt. */
export function normalizeChannel(input: string): string {
  return sourceForInput(input)?.normalize(input) ?? '';
}

/** Gespeicherter Kanalname -> Anzeigetext (`r/EarthPorn`, `@esa.int`). */
export function channelLabel(channel: string): string {
  return sourceForChannel(channel)?.label(channel) ?? channel;
}

export function fetchChannelImages(channel: string): Promise<ImageItem[]> {
  const source = sourceForChannel(channel);
  if (!source) {
    return Promise.reject(new Error(`„${channel}" gehört zu keiner der Quellen (mehr). ${INPUT_HELP}`));
  }
  return source.fetchImages(channel);
}

/** Bild-URL eines Favoriten -> per JavaScript ladbare URL (fuer das ZIP). */
export function toDownloadableUrl(item: ImageItem): string {
  return sourceForChannel(item.channel)?.toDownloadableUrl(item.url) ?? item.url;
}

/** Erreichbarkeit einer Quelle, wie sie in der Fussleiste steht. */
export interface SourceStatus {
  id: string;
  name: string;
  /** `null`, solange die Pruefung laeuft. */
  available: boolean | null;
}

/**
 * Fragt jede Quelle einmal zur Probe ab. Die Quellen haengen an fremden
 * Diensten, die zeitweise ausfallen - hier steht schwarz auf weiss, ob es
 * gerade an der Seite liegt oder nicht.
 */
export function checkAllSources(): Promise<SourceStatus[]> {
  return Promise.all(
    SOURCES.map(async source => ({
      id: source.id,
      name: source.displayName,
      available: await source.checkAvailability()
    }))
  );
}
