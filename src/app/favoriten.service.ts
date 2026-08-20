import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { toDownloadableUrl, type ImageItem } from './sources';
import { dateiNameFuer } from './downloads';

/**
 * Die Favoriten — aus der App-Klasse herausgezogen: Bestand samt Speicherung
 * im localStorage, das huepfende Herz und der Sammel-Download als ZIP.
 */
@Injectable({ providedIn: 'root' })
export class FavoritenDienst {
  private platformId = inject(PLATFORM_ID);

  favorites = signal<ImageItem[]>([]);

  /** URL des Bildes, dessen Herz gerade huepft (nur beim Hinzufuegen). */
  favoritePulse = signal<string | null>(null);
  private pulseTimer: ReturnType<typeof setTimeout> | undefined;

  isDownloadingZip = signal(false);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const storedFavs = localStorage.getItem('x_favorite_images');
      if (storedFavs) {
        try {
          this.favorites.set(JSON.parse(storedFavs));
        } catch (e) {}
      }
    }
  }

  /** Nimmt ein Bild in die Favoriten auf bzw. wieder heraus. */
  toggle(item: ImageItem) {
    const current = this.favorites();
    const exists = current.find(f => f.url === item.url);
    let updated: ImageItem[];

    if (exists) {
      updated = current.filter(f => f.url !== item.url);
    } else {
      updated = [...current, item];
      // Herz huepft nur beim Hinzufuegen - beim Entfernen waere das verwirrend.
      clearTimeout(this.pulseTimer);
      this.favoritePulse.set(item.url);
      this.pulseTimer = setTimeout(() => this.favoritePulse.set(null), 400);
    }

    this.favorites.set(updated);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('x_favorite_images', JSON.stringify(updated));
    }
  }

  isFavorite(url: string): boolean {
    return this.favorites().some(f => f.url === url);
  }

  /** Wirft alle Favoriten weg (Teil von „Alles loeschen"). */
  leeren() {
    this.favorites.set([]);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('x_favorite_images');
    }
  }

  /** Laedt alle Favoriten als ZIP herunter; Fehler gehen an [aufFehler]. */
  async ladeZip(aufFehler: (meldung: string) => void) {
    const favs = this.favorites();
    if (favs.length === 0) return;

    this.isDownloadingZip.set(true);
    const zip = new JSZip();
    let count = 0;

    for (let i = 0; i < favs.length; i++) {
      const fav = favs[i];
      try {
        // Jede Quelle weiss selbst, ueber welche Adresse sich ihre Bilder
        // per JavaScript laden lassen (X direkt, Reddit ueber weserv).
        const response = await fetch(toDownloadableUrl(fav));

        if (response.ok) {
          zip.file(dateiNameFuer(fav, i + 1), await response.blob());
          count++;
        }
      } catch (e) {
        console.error(`Failed to download ${fav.url}`, e);
      }
    }

    if (count > 0) {
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'favorites.zip');
    } else {
      aufFehler('Fehler beim Herunterladen der Bilder. CORS Blockade möglich.');
    }

    this.isDownloadingZip.set(false);
  }
}
