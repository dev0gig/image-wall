import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideServiceWorker} from '@angular/service-worker';

import {routes} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Service Worker: macht die Seite installierbar und offline benutzbar.
    // Beim Entwicklungs-Server bleibt er aus, sonst sieht man immer den alten Stand.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
