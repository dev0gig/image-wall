import { pinterestSource } from './pinterest.source';

describe('pinterestSource', () => {
  it('erkennt Konten und Pinnwaende aus Adressen', () => {
    expect(pinterestSource.normalize('https://www.pinterest.com/NASA/')).toBe('pin:nasa');
    expect(pinterestSource.normalize('https://at.pinterest.com/nasa/space-photos/')).toBe('pin:nasa/space-photos');
    expect(pinterestSource.normalize('pinterest.co.uk/nasa/space-photos/section-1/')).toBe('pin:nasa/space-photos');
    expect(pinterestSource.normalize('https://www.pinterest.de/nasa/gr%C3%BCn/')).toBe('pin:nasa/grün');
    expect(pinterestSource.normalize('pin:nasa/space-photos')).toBe('pin:nasa/space-photos');
  });

  it('versteht Reiter und Feed-Adressen als ganzes Konto', () => {
    expect(pinterestSource.normalize('https://www.pinterest.com/nasa/_saved/')).toBe('pin:nasa');
    expect(pinterestSource.normalize('https://www.pinterest.com/nasa/feed.rss')).toBe('pin:nasa');
    expect(pinterestSource.normalize('https://www.pinterest.com/nasa/space.rss')).toBe('pin:nasa/space');
  });

  it('nimmt nur an, was ein Konto ist', () => {
    expect(pinterestSource.accepts('https://www.pinterest.com/pin/424605071146230977/')).toBe(false);
    expect(pinterestSource.accepts('https://www.pinterest.com/search/pins/?q=x')).toBe(false);
    expect(pinterestSource.accepts('https://notpinterest.com/nasa/')).toBe(false);
    expect(pinterestSource.accepts('esa.int')).toBe(false);
    expect(pinterestSource.accepts('r/itookapicture')).toBe(false);
  });

  it('erkennt gespeicherte Kanaele nur am eigenen Praefix', () => {
    expect(pinterestSource.owns('pin:nasa')).toBe(true);
    expect(pinterestSource.owns('r/nasa')).toBe(false);
  });
});
