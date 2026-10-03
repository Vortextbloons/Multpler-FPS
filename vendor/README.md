# Vendored libraries

Everything in this folder is committed to the repo so the game ships with no
third-party requests. GitHub Pages serves these files as part of the site.

| File | Source | Version | License |
| --- | --- | --- | --- |
| `three/three.module.min.js` | unpkg.com `three@0.160.0/build/three.module.min.js` | 0.160.0 | MIT |
| `supabase/supabase-js.esm.js` | esm.sh `@supabase/supabase-js@2.117.2/es2022/supabase-js.bundle.mjs` (fully bundled, all sub-packages inlined) | 2.117.2 | Apache-2.0 |
| `supabase/polyfills/*.mjs` | esm.sh `node/{buffer,process,events,tty,async_hooks}.mjs` (Node shims the bundle imports; imports rewritten to relative paths) | — | MIT |
| `fonts/*.woff2` + `fonts/fonts.css` | Google Fonts (Barlow, Barlow Condensed, IBM Plex Mono; latin + latin-ext) | — | OFL |

Notes:

- The import map in `index.html` points at `./vendor/...` with relative paths,
  so it works both locally and under the `/Multpler-FPS/` subpath on Pages.
- `three/addons/` was previously mapped to a CDN but nothing imported it, so it
  is not vendored. If you ever import an addon, download the matching
  `examples/jsm/` file from three@0.160.0 into `vendor/three/addons/` and add a
  mapping like `"three/addons/": "./vendor/three/addons/"` to the import map.
- To update the fonts, run `tools/vendor-fonts.ps1`.
- To update Three.js or supabase-js, replace the files with the new version's
  bundle and update the versions in this table. supabase-js must be a *fully
  bundled* build (esm.sh `?bundle`), otherwise it pulls sub-packages from a CDN.