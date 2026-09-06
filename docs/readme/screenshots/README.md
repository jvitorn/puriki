# Puriki screenshots

This directory holds the real screenshots used by all three public READMEs
(English, pt-BR, Spanish). The image files are shared across the three
localized READMEs; only the alt text differs per language.

Current files:

- `home.png`
- `search.png`
- `anime-details.png`
- `my-list.png`
- `settings.png`

These were captured from a native Puriki development build running on an
Android emulator, in guest mode, with no provider account connected. No
mockups, design artifacts, or generated imagery are used.

## Refreshing the screenshot set

When the UI changes enough to make these captures stale:

1. Use the same accepted build and device scale for the complete set.
2. Prefer guest mode, or a dedicated test account, so no maintainer username,
   avatar, or personal watch history appears. If a provider account must be
   shown, use a safe test account or crop/select a state that does not expose
   personal data.
3. Avoid capturing OAuth pages, tokens, diagnostic output, notifications,
   debug overlays, the Metro/dev-client UI, or development menus.
4. Prefer representative provider data without implying endorsement.
5. Optimize files without upscaling or changing the app UI (lossless
   compression and reasonable downscaling to display resolution are fine).
6. Replace the files in this directory using the same filenames, then verify
   all three README versions still render them with correct localized alt
   text.
