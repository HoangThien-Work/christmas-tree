# Magic Christmas — Static build (Python)

This repository contains a small Python-based static-site generator to produce a deployable static version of the interactive "Magic Christmas" page (Three.js + MediaPipe). The runtime interactions remain client-side (Three.js, Mediapipe) — the Python scripts only build and package the static site into `dist/`.

Quick start

1. Install dependencies (prefer a venv):

```pwsh
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Put `audio.mp3` in the project root (optional). The images folder `img/` is used as-is.

3. Build the site:

```pwsh
python build.py
```

4. Serve `dist/` locally to test:

```pwsh
python -m http.server 8000 -d dist
# open http://localhost:8000
```

Deployment to GitHub Pages

- Option A (recommended): Push the contents of `dist/` to the `gh-pages` branch. You can automate with GitHub Actions.
- Option B: Move the files from `dist/` into the `docs/` folder on `main` branch and enable GitHub Pages to serve from `docs/`.

Notes

- Client-side libs (Three.js, MediaPipe) are loaded from CDNs in the template. If you prefer offline builds, copy the required vendor files into `dist/` and adjust the template.
- The generator reads `img/` for photos; it will copy the folder to `dist/img/`.
- If `audio.mp3` is missing, the built page will still work but without background music.

Files added

- `build.py` — build script
- `src/index.html.jinja` — Jinja template for `index.html`
- `src/js/main.js` — extracted/refactored JavaScript runtime
- `requirements.txt`, `README.md`

If you want, I can now:

- run `python build.py` and open the resulting page (if environment allows), or
- add a simple GitHub Actions workflow to publish `dist/` to `gh-pages` automatically.
# christmas-tree
Interaction with christmas tree to review couple memories pictures.
