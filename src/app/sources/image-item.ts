/**
 * Gemeinsame Bausteine fuer alle Bild-Quellen (Reddit, Bluesky, Mastodon, ...).
 *
 * Jede Quelle liegt in einem eigenen Unterordner und bringt einen Adapter mit,
 * der genau diese vier Fragen beantwortet:
 *   - gehoert diese Eingabe / dieser gespeicherte Name zu mir?
 *   - wie heisst der Kanal intern und wie wird er angezeigt?
 *   - wie hole ich die Bilder?
 *   - wie bekomme ich ein Bild per JavaScript herunter (fuer das ZIP)?
 */

export type SourceId = 'reddit' | 'bluesky' | 'mastodon';

/**
 * Bilder unter dieser Kantenlaenge sind Symbole, Logos oder Briefmarken und
 * gehoeren nicht an eine Bilderwand. Gemessen wird die **laengste** Kante:
 * ein schmales Panorama (700x377) ist ein echtes Bild, eine 140x140-Briefmarke
 * nicht.
 */
export const MIN_EDGE = 400;

/** Ist das Bild gross genug fuers Raster? Ohne bekannte Masse: ja. */
export function isBigEnough(width?: number, height?: number): boolean {
  if (!width || !height) return true;
  return Math.max(width, height) >= MIN_EDGE;
}

export interface ImageItem {
  /**
   * Das Originalbild in voller Aufloesung - fuer die Grossansicht, den
   * Download-Knopf und das Favoriten-ZIP.
   */
  url: string;

  /**
   * Verkleinerte Fassung fuers Raster (rund 700 px breit). Fehlt sie, wird
   * `url` angezeigt. Aeltere gespeicherte Bilder haben dieses Feld nicht.
   */
  preview?: string;

  /** Gespeicherter Kanalname: `r/EarthPorn`, `bsky:esa.int`, `mastodon:eff@mastodon.social`. */
  channel: string;
}

export interface SourceAdapter {
  readonly id: SourceId;

  /** Name der Quelle in der Oberflaeche, z. B. in der Fussleiste. */
  readonly displayName: string;

  /** Hoechstzahl der Bilder, die pro Kanal geholt werden. */
  readonly maxImages: number;

  /** Passt das, was der Nutzer eingetippt hat, zu dieser Quelle? */
  accepts(input: string): boolean;

  /** Gehoert ein bereits gespeicherter Kanalname zu dieser Quelle? */
  owns(channel: string): boolean;

  /** Eingabe (Handle, URL, r/Name ...) -> gespeicherter Kanalname. */
  normalize(input: string): string;

  /** Gespeicherter Kanalname -> Anzeigetext in der Oberflaeche. */
  label(channel: string): string;

  fetchImages(channel: string): Promise<ImageItem[]>;

  /**
   * Liefert diese Quelle gerade ueberhaupt etwas? Wird fuer die Anzeige in der
   * Fussleiste einmal mit einem bekannten Kanal zur Probe abgefragt.
   */
  checkAvailability(): Promise<boolean>;

  /**
   * Bild-URL -> URL, die sich per `fetch()` laden laesst.
   * Noetig, weil manche Bild-Server das Herunterladen per JavaScript verbieten.
   */
  toDownloadableUrl(url: string): string;
}
