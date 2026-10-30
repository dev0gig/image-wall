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
 * Aus der englischen Meldung des Dienstes einen Satz machen, der erklaert,
 * was los ist - vor allem: ob es am Nutzer liegt oder nicht.
 */
function explain(message: string, sourceName: string): string {
  if (/short period|api key/i.test(message)) {
    return 'Der Feed-Dienst bremst gerade (zu viele neue Quellen in kurzer Zeit). In ein paar Minuten nochmal versuchen.';
  }
  if (/valid RSS feed|could not be parsed/i.test(message)) {
    return `${sourceName} liefert gerade keinen brauchbaren Feed. Das liegt nicht an dir – bitte später nochmal versuchen.`;
  }
  if (/Cannot download this RSS feed/i.test(message)) {
    return `${sourceName} hat den Feed gerade nicht herausgegeben. Bitte nochmal versuchen oder den Namen prüfen.`;
  }
  return message;
}

/**
 * Holt die Eintraege eines Feeds.
 *
 * `attempts` > 1 lohnt sich bei Reddit: der erste Abruf eines noch nicht
 * zwischengespeicherten Feeds schlaegt dort oft fehl, der naechste klappt.
 */
export async function fetchFeedItems(
  rssUrl: string,
  sourceName: string,
  attempts = 1
): Promise<FeedItem[]> {
  const apiUrl = `${API}?rss_url=${encodeURIComponent(rssUrl)}`;
  let lastError = 'Fehler beim Abrufen des Feeds.';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(apiUrl);

      // Auch bei einem Fehler-Status (z. B. 429, wenn der Dienst bremst)
      // steht die Begruendung im Rumpf der Antwort - die wollen wir zeigen.
      const data = await response.json().catch(() => null);

      if (response.ok && data?.status === 'ok') {
        return (data.items ?? []) as FeedItem[];
      }

      lastError = data?.message
        ? explain(data.message, sourceName)
        : 'Fehler beim Abrufen des Feeds.';
    } catch {
      lastError = 'Fehler beim Abrufen des Feeds.';
    }

    if (attempt < attempts) {
      await wait(800);
    }
  }

  throw new Error(lastError);
}
