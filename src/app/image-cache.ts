/**
 * Zwischenspeicher fuer die Bilder einer Quelle.
 *
 * Ohne ihn fragte jeder Klick auf „Wall View" alle gespeicherten Konten neu ab
 * und das Raster blieb solange leer - bei 20 Konten rund acht Sekunden. Jetzt
 * liegt pro Kanal eine Liste im Browser (localStorage), die sofort angezeigt
 * wird; die frischen Bilder kommen im Hintergrund nach und ersetzen sie still.
 *
 * Gespeichert werden nur Adressen, keine Bilddaten: nachgemessen sind vier
 * Kanaele mit zusammen 365 Bildern 116 KB, 20 Kanaele also rund 600 KB. Der
 * Browser erlaubt etwa 5 MB.
 *
 * Dass die Adressen haltbar sind, ist Voraussetzung dafuer - `i.redd.it`,
 * `cdn.bsky.app` und die Mastodon-Server liefern unsignierte Adressen ohne
 * Ablaufdatum. Bei signierten Adressen (z. B. `preview.redd.it`) waere ein
 * Zwischenspeicher wertlos, weil sie nach kurzer Zeit tote Bilder liefern.
 */

import { ImageItem } from './sources';

const PREFIX = 'iw_cache_';

/** So lange gilt ein Stand als frisch genug, um gar nicht neu zu fragen. */
const FRESH_MS = 5 * 60 * 1000;

interface Entry {
  time: number;
  images: ImageItem[];
}

function keyFor(channel: string): string {
  return PREFIX + channel;
}

/** Was liegt fuer diesen Kanal bereit? `null`, wenn nichts (Brauchbares) da ist. */
export function readChannel(channel: string): Entry | null {
  try {
    const raw = localStorage.getItem(keyFor(channel));
    if (!raw) return null;

    const entry = JSON.parse(raw) as Entry;
    if (!Array.isArray(entry?.images) || typeof entry.time !== 'number') return null;

    return entry;
  } catch {
    // Unbrauchbarer Eintrag - dann wird eben neu geholt.
    return null;
  }
}

/** Wurde dieser Stand gerade eben erst geholt? */
export function isFresh(entry: Entry | null): boolean {
  return entry !== null && Date.now() - entry.time < FRESH_MS;
}

/**
 * Legt den Stand eines Kanals ab. Ist der Speicher voll, fliegen die aeltesten
 * Eintraege raus und es wird ein zweites Mal versucht - lieber ein Kanal
 * weniger im Zwischenspeicher als ein Fehler beim Laden.
 */
export function writeChannel(channel: string, images: ImageItem[]): void {
  const entry: Entry = { time: Date.now(), images };

  try {
    localStorage.setItem(keyFor(channel), JSON.stringify(entry));
  } catch {
    dropOldest(3);
    try {
      localStorage.setItem(keyFor(channel), JSON.stringify(entry));
    } catch {
      // Immer noch kein Platz: dann laeuft die Seite eben ohne Zwischenspeicher.
    }
  }
}

/** Alle abgelegten Kanaele mit ihrem Alter. */
function entries(): { key: string; time: number }[] {
  const found: { key: string; time: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;

    try {
      found.push({ key, time: (JSON.parse(localStorage.getItem(key) ?? '{}') as Entry).time ?? 0 });
    } catch {
      found.push({ key, time: 0 });
    }
  }

  return found;
}

function dropOldest(count: number): void {
  entries()
    .sort((a, b) => a.time - b.time)
    .slice(0, count)
    .forEach(entry => localStorage.removeItem(entry.key));
}

/** Wirft weg, was zu keinem gespeicherten Kanal mehr gehoert. */
export function pruneCache(keep: readonly string[]): void {
  const wanted = new Set(keep.map(keyFor));

  for (const entry of entries()) {
    if (!wanted.has(entry.key)) localStorage.removeItem(entry.key);
  }
}

/** Loescht den kompletten Zwischenspeicher (fuer „Reset All Data"). */
export function clearCache(): void {
  entries().forEach(entry => localStorage.removeItem(entry.key));
}
