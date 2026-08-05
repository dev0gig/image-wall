/**
 * Verzeichnis aller Bild-Quellen.
 *
 * Die Oberflaeche spricht nur mit den Funktionen hier unten und muss nicht
 * wissen, ob ein Kanal von X oder von Reddit kommt. Eine neue Quelle braucht
 * nur einen eigenen Unterordner mit ihrem Adapter und einen Eintrag in
 * `SOURCES`.
 */

import { blueskySource } from './bluesky/bluesky.source';
import { ImageItem, SourceAdapter } from './image-item';
import { redditSource } from './reddit/reddit.source';
import { xSource } from './x/x.source';

export { type ImageItem, type SourceAdapter, type SourceId } from './image-item';

/** Reihenfolge zaehlt: X ist die Standardquelle und steht deshalb am Ende. */
export const SOURCES: readonly SourceAdapter[] = [redditSource, blueskySource, xSource];

/** Welche Quelle ist gemeint, wenn der Nutzer `input` eintippt? */
export function sourceForInput(input: string): SourceAdapter {
  return SOURCES.find(source => source.accepts(input)) ?? xSource;
}

/** Zu welcher Quelle gehoert ein gespeicherter Kanalname? */
export function sourceForChannel(channel: string): SourceAdapter {
  return SOURCES.find(source => source.owns(channel)) ?? xSource;
}

/** Eingabe -> gespeicherter Kanalname (z. B. `@ArchDigest` -> `ArchDigest`). */
export function normalizeChannel(input: string): string {
  return sourceForInput(input).normalize(input);
}

/** Gespeicherter Kanalname -> Anzeigetext (`@ArchDigest`, `r/EarthPorn`). */
export function channelLabel(channel: string): string {
  return sourceForChannel(channel).label(channel);
}

export function fetchChannelImages(channel: string): Promise<ImageItem[]> {
  return sourceForChannel(channel).fetchImages(channel);
}

/** Bild-URL eines Favoriten -> per JavaScript ladbare URL (fuer das ZIP). */
export function toDownloadableUrl(item: ImageItem): string {
  return sourceForChannel(item.channel).toDownloadableUrl(item.url);
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
