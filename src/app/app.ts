import { ChangeDetectionStrategy, Component, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface ImageItem {
  url: string;
  channel: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [MatIconModule, NgTemplateOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(window:keydown)': 'handleKeyDown($event)'
  }
})
export class App {
  channelName = signal('');
  images = signal<ImageItem[]>([]);
  isLoading = signal(false);
  error = signal('');
  
  savedChannels = signal<string[]>([]);
  viewingAll = signal(false);
  
  favorites = signal<ImageItem[]>([]);
  viewingFavorites = signal(false);
  
  // Carousel State
  carouselOpen = signal(false);
  carouselIndex = signal(0);
  private touchStartX = 0;
  
  // Seitenleiste als Bottom-Sheet auf schmalen Bildschirmen
  menuOpen = signal(false);

  showClearConfirm = signal(false);
  isDownloadingZip = signal(false);
  showHelp = signal(false);
  
  private platformId = inject(PLATFORM_ID);
  
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const storedImages = localStorage.getItem('x_gallery_images');
      if (storedImages) {
        try {
          this.images.set(JSON.parse(storedImages));
        } catch (e) {}
      }
      
      const storedChannels = localStorage.getItem('x_saved_channels');
      if (storedChannels) {
        try {
          this.savedChannels.set(JSON.parse(storedChannels));
        } catch (e) {}
      }
      
      const storedFavs = localStorage.getItem('x_favorite_images');
      if (storedFavs) {
        try {
          this.favorites.set(JSON.parse(storedFavs));
        } catch (e) {}
      }
    }
  }
  
  saveCurrentChannel() {
    let channel = this.channelName().trim();
    if (!channel) return;
    
    if (channel.includes('x.com/')) channel = channel.split('x.com/')[1];
    if (channel.includes('twitter.com/')) channel = channel.split('twitter.com/')[1];
    if (channel.startsWith('@')) channel = channel.substring(1);
    channel = channel.split('/')[0];
    
    const currentSaved = this.savedChannels();
    if (!currentSaved.includes(channel)) {
      const updated = [...currentSaved, channel];
      this.savedChannels.set(updated);
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('x_saved_channels', JSON.stringify(updated));
      }
    }
  }

  removeChannel(channel: string, event: Event) {
    event.stopPropagation();
    const updated = this.savedChannels().filter(c => c !== channel);
    this.savedChannels.set(updated);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('x_saved_channels', JSON.stringify(updated));
    }
  }

  async loadChannel(channel: string) {
    this.menuOpen.set(false);
    this.channelName.set(channel);
    this.viewingAll.set(false);
    this.viewingFavorites.set(false);
    await this.loadImages();
  }

  async viewAll() {
    this.menuOpen.set(false);
    this.viewingAll.set(true);
    this.viewingFavorites.set(false);
    this.channelName.set('');
    this.isLoading.set(true);
    this.error.set('');
    this.images.set([]);
    
    const allChannels = this.savedChannels();
    if (allChannels.length === 0) {
      this.error.set('Keine gespeicherten Accounts vorhanden.');
      this.isLoading.set(false);
      return;
    }

    let allImages: ImageItem[] = [];
    
    for (const channel of allChannels) {
       try {
         const imgs = await this.fetchChannelImages(channel);
         allImages = [...allImages, ...imgs];
       } catch (e) {
         console.error(`Error loading ${channel}`, e);
       }
    }
    
    this.images.set(allImages);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('x_gallery_images', JSON.stringify(allImages));
    }
    this.isLoading.set(false);
  }

  async viewFavorites() {
    this.menuOpen.set(false);
    this.viewingFavorites.set(true);
    this.viewingAll.set(false);
    this.channelName.set('');
    this.isLoading.set(true);
    this.error.set('');
    
    const favs = this.favorites();
    this.images.set(favs);
    if (favs.length === 0) {
      this.error.set('Keine Favoriten vorhanden.');
    }
    
    this.isLoading.set(false);
  }

  toggleFavorite(item: ImageItem, event?: Event) {
    if (event) event.stopPropagation();
    const current = this.favorites();
    const exists = current.find(f => f.url === item.url);
    let updated: ImageItem[];
    
    if (exists) {
      updated = current.filter(f => f.url !== item.url);
    } else {
      updated = [...current, item];
    }
    
    this.favorites.set(updated);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('x_favorite_images', JSON.stringify(updated));
    }
    
    if (this.viewingFavorites()) {
      this.images.set(updated);
    }
  }

  isFavorite(url: string): boolean {
    return this.favorites().some(f => f.url === url);
  }

  async fetchChannelImages(channel: string): Promise<ImageItem[]> {
    const rssUrl = `https://nitter.net/${channel}/rss`;
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen des Feeds.');
    }
    
    const data = await response.json();
    if (data.status !== 'ok') {
      throw new Error(data.message || 'Kanal nicht gefunden.');
    }
    
    const extractedImages: ImageItem[] = [];
    const items = data.items || [];
    
    for (const item of items) {
      const html = item.content || item.description || '';
      const regex = /<img[^>]+src="([^">]+)"/gi;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
        let imgUrl = match[1];
        imgUrl = imgUrl.replace(/&amp;/g, '&');
        extractedImages.push({ url: imgUrl, channel });
        if (extractedImages.length >= 20) break;
      }
      if (extractedImages.length >= 20) break;
    }
    
    return extractedImages;
  }

  async loadImages() {
    let channel = this.channelName().trim() || 'ArchDigest';
    // Clean up input in case user pastes a URL or @handle
    if (channel.includes('x.com/')) channel = channel.split('x.com/')[1];
    if (channel.includes('twitter.com/')) channel = channel.split('twitter.com/')[1];
    if (channel.startsWith('@')) channel = channel.substring(1);
    channel = channel.split('/')[0]; // Remove any trailing paths like /media
    
    if (!channel) return;
    
    this.viewingAll.set(false);
    this.viewingFavorites.set(false);
    this.channelName.set(channel);
    this.isLoading.set(true);
    this.error.set('');
    this.images.set([]);
    
    try {
      const imgs = await this.fetchChannelImages(channel);
      
      if (imgs.length > 0) {
        this.images.set(imgs);
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('x_gallery_images', JSON.stringify(imgs));
        }
      } else {
        this.error.set('Keine Bilder gefunden. Eventuell existiert der Kanal nicht oder hat keine Medien.');
      }
    } catch (err: any) {
      this.error.set(err.message || 'Ein unbekannter Fehler ist aufgetreten.');
    } finally {
      this.isLoading.set(false);
    }
  }
  
  updateChannelName(event: Event) {
    this.channelName.set((event.target as HTMLInputElement).value);
  }

  // Carousel Logic
  openCarousel(index: number) {
    this.carouselIndex.set(index);
    this.carouselOpen.set(true);
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = 'hidden';
    }
  }

  closeCarousel() {
    this.carouselOpen.set(false);
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  nextImage(event?: Event) {
    event?.stopPropagation();
    const len = this.images().length;
    if (len > 0) {
      this.carouselIndex.update(i => (i + 1) % len);
    }
  }

  prevImage(event?: Event) {
    event?.stopPropagation();
    const len = this.images().length;
    if (len > 0) {
      this.carouselIndex.update(i => (i - 1 + len) % len);
    }
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.carouselOpen()) {
      if (event.key === 'Escape') {
        if (this.showHelp()) this.showHelp.set(false);
        else if (this.menuOpen()) this.menuOpen.set(false);
      }
      return;
    }
    if (event.key === 'ArrowRight') this.nextImage();
    if (event.key === 'ArrowLeft') this.prevImage();
    if (event.key === 'Escape') this.closeCarousel();
  }

  onTouchStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  onTouchEnd(event: TouchEvent) {
    const touchEndX = event.changedTouches[0].screenX;
    if (this.touchStartX - touchEndX > 50) this.nextImage();
    if (touchEndX - this.touchStartX > 50) this.prevImage();
  }

  // Settings & Data Management
  clearCache() {
    this.savedChannels.set([]);
    this.favorites.set([]);
    this.images.set([]);
    this.channelName.set('');
    this.viewingAll.set(false);
    this.viewingFavorites.set(false);
    
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('x_saved_channels');
      localStorage.removeItem('x_favorite_images');
      localStorage.removeItem('x_gallery_images');
    }
    this.showClearConfirm.set(false);
  }

  exportChannels() {
    const data = JSON.stringify(this.savedChannels(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    saveAs(blob, 'saved_channels.json');
  }

  triggerImport() {
    if (isPlatformBrowser(this.platformId)) {
      document.getElementById('import-input')?.click();
    }
  }

  handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            // merge with existing, or replace. Let's merge and deduplicate
            const current = this.savedChannels();
            const merged = Array.from(new Set([...current, ...parsed]));
            this.savedChannels.set(merged);
            if (isPlatformBrowser(this.platformId)) {
              localStorage.setItem('x_saved_channels', JSON.stringify(merged));
            }
          }
        } catch (err) {
          console.error("Invalid file format");
        }
        input.value = ''; // reset
      };
      reader.readAsText(file);
    }
  }

  /**
   * Nitter-Bild-URLs (https://nitter.net/pic/media%2Fabc.jpg) zeigen auf Twitter/X.
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

  async downloadFavoritesZip() {
    const favs = this.favorites();
    if (favs.length === 0) return;
    
    this.isDownloadingZip.set(true);
    const zip = new JSZip();
    let count = 0;

    for (let i = 0; i < favs.length; i++) {
      const fav = favs[i];
      try {
        const response = await fetch(this.toDownloadableUrl(fav.url));
        
        if (response.ok) {
          const blob = await response.blob();
          
          let ext = 'jpg';
          if (fav.url.toLowerCase().includes('.png')) ext = 'png';
          if (fav.url.toLowerCase().includes('.gif')) ext = 'gif';
          
          const filename = `${fav.channel}_${i + 1}.${ext}`;
          zip.file(filename, blob);
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
      this.error.set('Fehler beim Herunterladen der Bilder. CORS Blockade möglich.');
    }
    
    this.isDownloadingZip.set(false);
  }
}
