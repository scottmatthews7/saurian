# Deploying Saurian (so friends can just click a link)

Saurian is a **static web game** — vendored Babylon.js + ES modules + asset files,
no backend, no build step. Hosting = serve the folder; players open a URL and play
(WASD + mouse, desktop browser). Nothing to install.

## GitHub Pages (the share link) — one-time setup

This repo ships a Pages workflow (`.github/workflows/deploy.yml`) that publishes
the whole repo on every push to `main`. Do this once:

1. **Create the public repo** on GitHub named **`saurian`** under your account
   (`scottmatthews7`), if it doesn't exist yet.
2. **Push** this project to it:
   ```bash
   git remote add origin https://github.com/scottmatthews7/saurian.git   # if not set
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
   (Just select it once; the included workflow does the rest.)
4. Wait ~1–2 min for the **Deploy to GitHub Pages** action to finish (Actions tab).
5. **Your play link:** **https://scottmatthews7.github.io/saurian/**

From then on, every `git push` to `main` auto-redeploys. **Share the link in
WhatsApp** — friends click it on a laptop and play. It unfurls as a preview card
(screenshot + title) thanks to the Open Graph tags in `index.html`.

## Local testing

```bash
python3 -m http.server 8000      # then open http://127.0.0.1:8000
```
(Must be served over http — ES modules + fetch don't work from a `file://` path.)

## Notes
- All asset paths are **relative**, so it works from the `/saurian/` subpath.
- `.nojekyll` is included so GitHub serves every file as-is.
- For a prettier link later: add a **custom domain** (Settings → Pages), or also
  drop the folder on **netlify.com/drop** for a `saurian.netlify.app` URL, or zip
  it (with `index.html` at root) and upload to **itch.io** as an HTML5 game.
- Requirements for players: a modern desktop browser with WebGL2 (Chrome/Edge/
  Safari/Firefox). Keyboard + mouse; not built for phones.
