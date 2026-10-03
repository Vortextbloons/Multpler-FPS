# Multpler FPS

Play at [Vortextbloons.github.io/Multpler-FPS](https://vortextbloons.github.io/Multpler-FPS/).

Multpler FPS is a browser-based first-person arena shooter with solo bot matches and a public multiplayer room. The site is plain HTML, CSS, and JavaScript; it requires no build step. GitHub Pages publishes the root of `main`. The `.nojekyll` file makes Pages serve these files directly.

To run locally, serve this directory over HTTP (for example, `python -m http.server 8000`) and open `http://localhost:8000/`. Opening `index.html` as a local file will not load JavaScript modules reliably.

Multiplayer uses the public Supabase project configured in `js/config.js`. Solo mode works without a multiplayer connection. All libraries (Three.js, Supabase JS) and fonts are vendored into `vendor/` and committed to the repo, so the page loads with no third-party requests — see `vendor/README.md`. Solo mode works fully offline; multiplayer still needs internet access to reach the Supabase server.

> **Free-tier note:** Supabase pauses inactive projects after ~7 days. A paused project loses its DNS record, which appears in the browser as `ERR_NAME_NOT_RESOLVED` for `*.supabase.co` plus `Room connection channel_error`, even though the site itself is fine. Restore the project (`neon-arena-ffa`, ref `jkyatcblkxqtcdaxkvks`) from the Supabase dashboard or via the Management API, and multiplayer reconnects with no code change.
    