/**
 * Kleiner Helfer um api.rss2json.com.
 *
 * Der Dienst liest einen RSS-/Atom-Feed und gibt ihn als JSON zurueck. Wir
 * brauchen ihn, weil weder Nitter noch Reddit ihre Feeds direkt an eine
 * Web-App herausgeben (fehlender CORS-Header).
 *
 * Achtung: ohne API-Schluessel liefert rss2json hoechstens 10 Eintraege pro
 * Feed. Bei X macht das nichts (ein Beitrag kann mehrere Bilder haben), bei
 * Reddit begrenzt es die Ausbeute auf 10 Bilder pro Subreddit.
 */

export interface FeedItem {
  title?: string;
  link?: string;
  thumbnail?: string;
  description?: string;
  content?: string;
}

const API = 'https://api.rss2json.com/v1/api.json';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Holt die Eintraege eines Feeds.
 *
 * `attempts` > 1 lohnt sich bei Reddit: der erste Abruf eines noch nicht
 * zwischengespeicherten Feeds schlaegt dort oft fehl, der naechste klappt.
 */
export async function fetchFeedItems(rssUrl: string, attempts = 1): Promise<FeedItem[]> {
  const apiUrl = `${API}?rss_url=${encodeURIComponent(rssUrl)}`;
  let lastError = 'Fehler beim Abrufen des Feeds.';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        lastError = 'Fehler beim Abrufen des Feeds.';
      } else {
        const data = await response.json();
        if (data.status === 'ok') {
          return (data.items ?? []) as FeedItem[];
        }
        lastError = data.message || 'Kanal nicht gefunden.';
      }
    } catch {
      lastError = 'Fehler beim Abrufen des Feeds.';
    }

    if (attempt < attempts) {
      await wait(800);
    }
  }

  throw new Error(lastError);
}
