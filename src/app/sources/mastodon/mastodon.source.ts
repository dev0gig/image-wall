/**
 * Quelle: Mastodon (und alles, was dessen Schnittstelle spricht, z. B. Pixelfed).
 *
 * Mastodon ist nicht ein Dienst, sondern viele: Jeder Server ("Instanz") steht
 * fuer sich, und eine Adresse nennt beide Teile - `@name@server.tld`. Gefragt
 * wird deshalb immer der Server, auf dem das Konto liegt.
 *
 * Wie Bluesky braucht es dafuer keinen Vermittler: Die Schnittstelle erlaubt
 * fremden Seiten den Zugriff (CORS), es gibt einen Schalter fuer "nur
 * Beitraege mit Medien", und die Bilder lassen sich sogar direkt herunterladen.
 *
 * Kanaele werden als `mastodon:<name>@<server>` gespeichert.
 */

import { ImageItem, SourceAdapter } from '../image-item';

const MAX_IMAGES = 100;

/** Mehr als 40 Beitraege gibt Mastodon pro Abruf nicht heraus. */
const PAGE_SIZE = 40;

/** Hoechstens so viele Seiten blaettern - Ruecksicht auf fremde Server. */
const MAX_PAGES = 3;

/** Bekanntes Konto - nur fuer die Erreichbarkeitspruefung. */
const PROBE = 'Mastodon@mastodon.social';

const PREFIX = 'mastodon:';

/** `@name@server.tld` oder `name@server.tld` - der Server hat immer einen Punkt. */
const ADDRESS = /^@?([^@\s]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

interface Address {
  user: string;
  instance: string;
}

/** Holt Benutzer und Server aus allen Schreibweisen. */
function addressFrom(input: string): Address | null {
  let text = input.trim();

  if (text.toLowerCase().startsWith(PREFIX)) text = text.slice(PREFIX.length);

  // Profil-Adresse: https://server.tld/@name (oder /@name@anderer.server)
  const fromUrl = text.match(/^https?:\/\/([^/?#\s]+)\/@([^/?#\s]+)/i);
  if (fromUrl) {
    const [, host, rest] = fromUrl;
    const remote = rest.match(ADDRESS);
    // Zeigt der Server nur ein fremdes Profil an, fragen wir dessen Heimatserver.
    return remote
      ? { user: remote[1], instance: remote[2] }
      : { user: rest, instance: host };
  }

  const match = text.match(ADDRESS);
  return match ? { user: match[1], instance: match[2] } : null;
}

function addressOf(channel: string): Address {
  const address = addressFrom(channel);
  if (!address) throw new Error('Keine gültige Mastodon-Adresse.');
  return address;
}

interface Status {
  id: string;
  media_attachments?: { type?: string; url?: string }[];
  reblog?: { media_attachments?: { type?: string; url?: string }[] } | null;
}

async function ask(url: string, instance: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`Der Mastodon-Server ${instance} antwortet nicht.`);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'Dieses Mastodon-Konto gibt es dort nicht.'
        : `Der Mastodon-Server ${instance} meldet einen Fehler (${response.status}).`
    );
  }

  return data;
}

async function accountId({ user, instance }: Address): Promise<string> {
  const url = `https://${instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(user)}`;
  const account = (await ask(url, instance)) as { id?: string };

  if (!account?.id) throw new Error(`Das Mastodon-Konto @${user}@${instance} gibt es nicht.`);
  return account.id;
}

/** Bilder eines Beitrags - bei einem geteilten Beitrag die des Originals. */
function imagesFrom(status: Status): string[] {
  const attachments = status.reblog?.media_attachments ?? status.media_attachments ?? [];
  return attachments
    .filter(media => media.type === 'image' && media.url)
    .map(media => media.url as string);
}

export const mastodonSource: SourceAdapter = {
  id: 'mastodon',
  displayName: 'Mastodon',
  maxImages: MAX_IMAGES,

  accepts: (input: string) => addressFrom(input) !== null,

  owns: (channel: string) => channel.toLowerCase().startsWith(PREFIX),

  normalize: (input: string) => {
    const address = addressFrom(input);
    return address ? `${PREFIX}${address.user}@${address.instance}` : '';
  },

  label: (channel: string) => {
    const address = addressFrom(channel);
    return address ? `@${address.user}@${address.instance}` : channel;
  },

  async fetchImages(channel: string): Promise<ImageItem[]> {
    const address = addressOf(channel);
    const id = await accountId(address);

    const images: ImageItem[] = [];
    const seen = new Set<string>();
    let maxId: string | undefined;

    for (let page = 0; page < MAX_PAGES && images.length < MAX_IMAGES; page++) {
      const url =
        `https://${address.instance}/api/v1/accounts/${id}/statuses` +
        `?only_media=true&limit=${PAGE_SIZE}` +
        (maxId ? `&max_id=${maxId}` : '');

      const statuses = (await ask(url, address.instance)) as Status[];
      if (!Array.isArray(statuses) || statuses.length === 0) break;

      for (const status of statuses) {
        for (const image of imagesFrom(status)) {
          if (seen.has(image)) continue;

          seen.add(image);
          images.push({ url: image, channel });
          if (images.length >= MAX_IMAGES) return images;
        }
      }

      // Weiterblaettern ab dem aeltesten Beitrag dieser Seite.
      maxId = statuses[statuses.length - 1].id;
    }

    return images;
  },

  async checkAvailability(): Promise<boolean> {
    try {
      await accountId(addressOf(PROBE));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Mastodon-Server liefern ihre Bilder auch an fremde Seiten aus (CORS), das
   * ZIP kann also direkt zugreifen - kein Umweg noetig wie bei Reddit oder
   * Bluesky.
   */
  toDownloadableUrl: (url: string) => url
};
