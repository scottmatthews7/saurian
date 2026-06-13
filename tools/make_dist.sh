#!/usr/bin/env bash
# Build the shipping artefact for GitHub Pages: copy ONLY what the game loads at
# runtime into dist/ (see docs/DEPLOY.md size audit). Re-run the audit if the
# asset set changes — exclusions below assume the 2026-06-12 build.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

cp index.html dist/
touch dist/.nojekyll
cp CREDITS.md dist/ 2>/dev/null || true   # CC-BY attribution must ship with the game
cp -R src dist/src
cp -R lib dist/lib

# design/: ONLY the three runtime-fetched JSONs, at their exact paths
mkdir -p dist/design
cp design/map.grid.json design/map.props.json design/map.json dist/design/

# assets/: everything except non-shipping weight
mkdir -p dist/assets
cp -R assets/models dist/assets/models
cp -R assets/audio dist/assets/audio
[ -d assets/textures ] && cp -R assets/textures dist/assets/textures
[ -d assets/env ] && cp -R assets/env dist/assets/env
rm -rf dist/assets/audio/candidates
rm -f dist/assets/env/sky2.hdr
# never loaded by the game (tooling/reference only — docs/DEPLOY.md)
rm -f dist/assets/models/free_cliff_rock.glb \
      dist/assets/models/triceratops.glb \
      dist/assets/models/apatosaurus.glb

echo "dist/ ready: $(du -sh dist | cut -f1) (repo working tree: $(du -sh . | cut -f1))"
