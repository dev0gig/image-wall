import { signal } from '@angular/core';

/**
 * Das Vollbild-Karussell — aus der App-Klasse herausgezogen. Haelt nur seinen
 * eigenen Zustand (offen, Stelle, Wisch-Anfang); wie viele Bilder es gibt,
 * fragt es ueber [anzahl] nach.
 */
export class Karussell {
  open = signal(false);
  index = signal(0);
  private touchStartX = 0;

  constructor(
    private anzahl: () => number,
    private imBrowser: boolean,
  ) {}

  oeffne(index: number) {
    this.index.set(index);
    this.open.set(true);
    if (this.imBrowser) {
      document.body.style.overflow = 'hidden';
    }
  }

  schliesse() {
    this.open.set(false);
    if (this.imBrowser) {
      document.body.style.overflow = '';
    }
  }

  weiter(event?: Event) {
    event?.stopPropagation();
    const len = this.anzahl();
    if (len > 0) {
      this.index.update(i => (i + 1) % len);
    }
  }

  zurueck(event?: Event) {
    event?.stopPropagation();
    const len = this.anzahl();
    if (len > 0) {
      this.index.update(i => (i - 1 + len) % len);
    }
  }

  beruehrungStart(event: TouchEvent) {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  beruehrungEnde(event: TouchEvent) {
    const touchEndX = event.changedTouches[0].screenX;
    if (this.touchStartX - touchEndX > 50) this.weiter();
    if (touchEndX - this.touchStartX > 50) this.zurueck();
  }
}
