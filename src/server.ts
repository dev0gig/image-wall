import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 */
app.get('/api/nitter/:channel', async (req, res) => {
  const channel = req.params.channel;
  const instances = [
    'https://nitter.poast.org',
    'https://nitter.privacydev.net',
    'https://nitter.projectsegfau.lt'
  ];
  
  let images: string[] = [];
  
  for (const instance of instances) {
    try {
      const url = `${instance}/${channel}/media/rss`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) continue;
      
      const text = await response.text();
      const regex = /<img[^>]+src="([^">]+)"/gi;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        let imgUrl = match[1];
        if (imgUrl.startsWith('/')) {
          imgUrl = instance + imgUrl;
        }
        imgUrl = imgUrl.replace(/&amp;/g, '&');
        images.push(imgUrl);
        if (images.length >= 10) break;
      }
      
      if (images.length > 0) break;
    } catch (err) {
      console.error(`Failed instance: ${instance}`);
    }
  }
  
  res.json({ images: images.slice(0, 10) });
});

app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query['url'] as string;
    if (!imageUrl) {
      res.status(400).send('No URL provided');
      return;
    }
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      res.status(response.status).send('Failed to fetch image');
      return;
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error');
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
