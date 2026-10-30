import { normalizeChannel, sourceForChannel, toDownloadableUrl } from './index';

describe('Quellen', () => {
  it('kennt nur noch Reddit', () => {
    expect(normalizeChannel('r/itookapicture')).toBe('r/itookapicture');
    expect(normalizeChannel('esa.int')).toBe('');
    expect(normalizeChannel('r/esa.int')).toBe('');
    expect(normalizeChannel('r/')).toBe('');
    expect(normalizeChannel('@eff@mastodon.social')).toBe('');
    expect(sourceForChannel('bsky:esa.int')).toBeNull();
    expect(sourceForChannel('mastodon:eff@mastodon.social')).toBeNull();
  });

  it('laedt alte Favoriten entfernter Quellen weiterhin ueber den Weiterleiter', () => {
    const url = toDownloadableUrl({ url: 'https://cdn.bsky.app/img/x.jpg', channel: 'bsky:esa.int' });
    expect(url).toBe('https://images.weserv.nl/?url=cdn.bsky.app%2Fimg%2Fx.jpg');
  });
});
