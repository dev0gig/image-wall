# Image Wall Agent Instructions

Image Wall ist eine kleine statische Angular-PWA. Meta-Infrastruktur bewusst klein halten.

## Regeln
- README lesen und bestehende Angular-21-Struktur nutzen.
- localStorage-Schlüssel/Formate nicht beiläufig ändern; dort liegen Quellen, Favoriten, Galerie und Cache.
- Quellenadapter für Bluesky/Mastodon/Reddit getrennt halten; X/Nitter nicht wieder einführen.
- Originalbild-URLs für Großansicht/Download/Favoriten erhalten; Rasteroptimierung darf sie nicht ersetzen.
- Caching-/Parallelitätsregeln nicht ohne Messgrund verschlechtern.
- GitHub-Pages-baseHref und PWA-Service-Worker berücksichtigen.

## Verifikation
`npm run build`, relevante Tests/Lint soweit vorhanden und betroffene UI-/PWA-Flows prüfen.

Keine permanente Prompt-Queue oder STATUS-Datei nötig. Für die Größe des Projekts reichen README + diese Agentenregeln; größere Einzelvorhaben können explizit beauftragt werden.
