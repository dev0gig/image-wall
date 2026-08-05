/**
 * Gemeinsame Bausteine fuer alle Bild-Quellen (X, Reddit, ...).
 *
 * Jede Quelle liegt in einem eigenen Unterordner und bringt einen Adapter mit,
 * der genau diese vier Fragen beantwortet:
 *   - gehoert diese Eingabe / dieser gespeicherte Name zu mir?
 *   - wie heisst der Kanal intern und wie wird er angezeigt?
 *   - wie hole ich die Bilder?
 *   - wie bekomme ich ein Bild per JavaScript herunter (fuer das ZIP)?
 */

export type SourceId = 'x' | 'reddit';

export interface ImageItem {
  url: string;
  /** Gespeicherter Kanalname, z. B. `ArchDigest` (X) oder `r/EarthPorn` (Reddit). */
  channel: string;
}

export interface SourceAdapter {
  readonly id: SourceId;

  /** Hoechstzahl der Bilder, die pro Kanal geholt werden. */
  readonly maxImages: number;

  /** Passt das, was der Nutzer eingetippt hat, zu dieser Quelle? */
  accepts(input: string): boolean;

  /** Gehoert ein bereits gespeicherter Kanalname zu dieser Quelle? */
  owns(channel: string): boolean;

  /** Eingabe (Handle, @Handle, URL, r/Name ...) -> gespeicherter Kanalname. */
  normalize(input: string): string;

  /** Gespeicherter Kanalname -> Anzeigetext in der Oberflaeche. */
  label(channel: string): string;

  fetchImages(channel: string): Promise<ImageItem[]>;

  /**
   * Bild-URL -> URL, die sich per `fetch()` laden laesst.
   * Noetig, weil manche Bild-Server das Herunterladen per JavaScript verbieten.
   */
  toDownloadableUrl(url: string): string;
}
