import { type ImageItem } from './sources';

/** Dateiname fuer ein heruntergeladenes Bild, z. B. `r_EarthPorn_3.jpg`. */
export function dateiNameFuer(item: ImageItem, index: number): string {
  let ext = 'jpg';
  if (item.url.toLowerCase().includes('.png')) ext = 'png';
  if (item.url.toLowerCase().includes('.gif')) ext = 'gif';

  // Kanalnamen enthalten Zeichen, die in Dateinamen nichts verloren haben:
  // der Schraegstrich in `r/EarthPorn` legt sonst einen Ordner an, der
  // Doppelpunkt in `bsky:name` ist unter Windows unzulaessig.
  const name = item.channel.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${name}_${index}.${ext}`;
}
