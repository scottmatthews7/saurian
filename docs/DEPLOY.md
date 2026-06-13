# Saurian — deployment-readiness audit and runbook

Date: 2026-06-12. Audited branch: `session-dino-and-spawn-props`.
Scope: static web app (decision: no Tauri/Electron). No build step — `index.html`
+ ES modules in `src/` + vendored `lib/` + `assets/` + the three runtime map JSONs
in `design/`.

This supersedes the size/hygiene guidance implied by the root `DEPLOY.md`
(whose workflow publishes the **whole repo** — see §5). It is a report and
runbook only: nothing has been compressed, moved or deleted.

---

## 1. Size audit

Headline numbers (today, on disk):

| Bucket | Size |
| --- | --- |
| Repo working tree (excl. `.git`) | ~410 MB |
| `.git` | 103 MB |
| `assets/` | 369 MB (of which `assets/reference/` non-shipping archive: 16 MB) |
| `lib/` | 8.5 MB |
| `src/` | 0.6 MB |
| `design/` | 10 MB (only 2.1 MB of it ships — see below) |
| `tools/` | 21 MB (non-shipping) |
| **Shipping payload (allowlist, §5)** | **~286 MB** |

"Loaded at runtime" was established by grepping `src/` + `index.html` for each
filename, plus field-level string extraction (`node -e`, recursive walk) over
`design/map.json` and `design/map.props.json` — both of which **are fetched by
the game at boot** (`src/map.js`; `src/config.js` `gridUrl`/`propsUrl`), along
with `design/map.grid.json`. So those three JSONs ship; the rest of `design/`
does not.

### Every file > 1 MB

| File | MB | Runtime-loaded? | Referenced by |
| --- | ---: | --- | --- |
| `assets/models/free_cliff_rock.glb` | 74.3 | **NO** | `tools/biome_shots.html` only — never shipped, never loaded |
| `assets/models/realistic_trees_pack_of_2_free.glb` | 71.3 | YES | `src/config.js`, `design/map.props.json` |
| `assets/models/cliff.glb` | 58.1 | YES | `src/config.js`, `src/map.js`, `design/map.json` (wallAssets) |
| `assets/models/desert__rocks__stones__pack.glb` | 26.0 | YES | `design/map.props.json` (prop layer) — *not* named in `src/` |
| `assets/models/locust_tree_pack.glb` | 20.8 | YES | `src/config.js`, `design/map.props.json` |
| `assets/models/jungle_tree.glb` | 16.2 | YES | `src/config.js`, `design/map.json`, `design/map.props.json` |
| `assets/models/desert_shrubs.glb` | 10.5 | YES | `src/config.js`, `design/map.props.json` |
| `lib/babylon.js` | 8.2 | YES | `index.html` (with `lib/babylonjs.loaders.min.js`, 0.5 MB) |
| `assets/models/triceratops_hi_anim.glb` | 7.4 | YES | `src/dino.js` |
| `assets/models/raptor_hi_anim.glb` | 7.4 | YES | `src/dino.js` |
| `assets/models/trex_hi_anim.glb` | 7.2 | YES | `src/dino.js` |
| `assets/reference/triceratops_hi.glb` | 7.2 | NO | non-shipping archive |
| `assets/reference/trex_hi.glb` | 7.0 | NO | non-shipping archive |
| `assets/models/desert_old_tree.glb` | 3.7 | YES | `src/config.js`, `design/map.props.json` |
| `design/reference/existing_desert.png` | 3.6 | NO | design reference |
| `design/reference/existing_grassland.png` | 3.3 | NO | design reference |
| `assets/models/raptor_nest.glb` | 3.1 | YES | `src/config.js`, `design/map.json` |
| `assets/models/stego_skeleton.glb` | 2.9 | YES | `src/config.js` |
| `assets/models/geranium2.glb` | 2.8 | YES | `src/config.js`, `design/map.props.json` |
| `assets/models/brachiosaurus_hi_anim.glb` | 2.4 | YES | `src/config.js`, `src/dino.js` |
| `assets/textures/bark_normal.jpg` | 2.3 | YES | `src/` |
| `assets/reference/brachiosaurus_hi.glb` | 2.3 | NO | non-shipping archive |
| `assets/textures/grass_normal.jpg` | 2.2 | YES | `src/` |
| `assets/models/forest_trees.glb` | 2.0 | YES | `src/config.js`, `design/map.props.json` |
| `assets/textures/rock_normal.jpg` | 2.0 | YES | `src/` |
| `assets/textures/dryground_normal.jpg` | 1.9 | **Probably NO** | no reference found (only `dryground_albedo.jpg` is named, `src/config.js:960`) — verify before excluding |
| `assets/textures/grass_albedo.jpg` | 1.9 | YES | `src/` |
| `design/map.props.json` | 1.9 | YES | fetched at boot (`src/config.js` `propsUrl`) |
| `assets/models/human.glb` | 1.9 | YES | `src/dino.js` |
| `tools/shots/biomes/*.png` (8 files) | ~11 | NO | gitignored tool output |
| `assets/models/dead_pilot.glb` | 1.7 | YES | `src/config.js`, `design/map.json` |
| `assets/textures/bark_albedo.jpg` | 1.6 | YES | `src/` |
| `assets/textures/dryground_albedo.jpg` | 1.5 | YES | `src/config.js` |
| `assets/env/sky.hdr` | 1.4 | YES | `src/config.js:801` |
| `assets/textures/rock_albedo.jpg` | 1.2 | YES | `src/` |
| `assets/env/sky2.hdr` | 1.1 | NO | `environment-picker.html` (dev tool) only |
| `assets/models/old_tree.glb` | 1.0 | YES | `src/config.js` |
| `assets/models/fishing_boat.glb` | 1.0 | YES | `src/config.js`, `design/map.json` |

### Other non-shipping files found in `assets/`

| File | MB | Why excluded |
| --- | ---: | --- |
| `assets/models/triceratops.glb` | 0.3 | superseded by `triceratops_hi_anim.glb`; no `src/` reference (tools only) |
| `assets/models/apatosaurus.glb` | 0.4 | superseded by `brachiosaurus_hi_anim.glb`; no `src/` reference (tools only) |
| `assets/audio/candidates/` | 1.6 | audition pool for the audio picker, not loaded by the game |
| `assets/audio/herbivore.mp3`, `herbivore_b.mp3` | <0.2 | no reference (`herbivore_a.mp3` is used) — verify before excluding |

**Shipping payload ≈ 286 MB** (everything the game fetches: `index.html`,
`landing.html` → links to `index.html`, `share-card.jpg` (the `og:image`),
`src/`, `lib/`, the three `design/map*.json`, `assets/models/` minus the three
dead models, `assets/textures/`, `assets/env/sky.hdr`, `assets/audio/` minus
`candidates/`). The six big environment packs alone (trees ×2, cliff, desert
rocks, jungle tree, desert shrubs) are **203 MB — 71 % of the payload**.

---

## 2. Compression plan (per oversized shipping glb)

Two-stage strategy, in order of friction:

**Stage A — zero loader changes (do this first).**
`@gltf-transform/cli` with WebP texture re-encoding + mesh quantisation +
dedup/prune/simplify. Output uses `EXT_texture_webp` and
`KHR_mesh_quantization`, both of which the vendored Babylon glTF loader
(`lib/babylonjs.loaders.min.js`) supports **natively** — no decoder wasm, no
`lib/` additions. The big packs are texture-heavy free-marketplace assets, so
this alone is expected to be the bulk of the win.

```bash
npx @gltf-transform/cli optimize \
  assets/models/realistic_trees_pack_of_2_free.glb out/realistic_trees_pack_of_2_free.glb \
  --compress quantize --texture-compress webp
```

(`optimize` bundles dedup, instance, palette, prune, resample, simplify,
quantise. Inspect what dominates a file first with
`npx @gltf-transform/cli inspect assets/models/cliff.glb` — it prints
per-texture and per-primitive byte counts, so you compress what is actually
big rather than guessing.)

**Stage B — geometry codecs, only for files still over budget** (the 25 MB/file
budget matters if Cloudflare Pages is ever the host, §3). Pick ONE codec:

- **Meshopt (`EXT_meshopt_compression`)** — preferred: fast decode, small decoder.
  ```bash
  gltfpack -i assets/models/cliff.glb -o out/cliff.glb -cc -tc
  ```
  (`-cc` = meshopt compression, `-tc` = KTX2/BasisU textures — see loader cost
  below; drop `-tc` and keep Stage-A WebP textures to avoid the KTX2 decoder.)
  Babylon requirement: vendor `meshopt_decoder.js` (from the meshoptimizer
  repo) into `lib/` and set, before any load:
  `BABYLON.MeshoptCompression.Configuration.decoder.url = "lib/meshopt_decoder.js";`
  Without this Babylon fetches the decoder from `cdn.babylonjs.com` at runtime —
  works, but adds a third-party dependency to every page load.

- **Draco (`KHR_draco_mesh_compression`)** — best geometry ratios, heavier decoder.
  ```bash
  npx @gltf-transform/cli optimize assets/models/cliff.glb out/cliff.glb \
    --compress draco --texture-compress webp
  ```
  Babylon requirement: vendor the Draco decoder (`draco_decoder_gltf.wasm` +
  `draco_wasm_wrapper_gltf.js`) into `lib/draco/` and set
  `BABYLON.DracoCompression.Configuration.decoder = { wasmUrl, wasmBinaryUrl, fallbackUrl }`
  to those paths. Default is again the Babylon CDN.

- **KTX2/Basis textures** (`-tc` above) — keeps textures compressed **on the
  GPU** (VRAM win, not just wire win), but requires the KTX2 transcoder
  bundle (`babylon.ktx2Decoder` + Basis transcoder wasm) vendored and
  configured via `BABYLON.KhronosTextureContainer2.URLConfig`. Largest loader
  footprint of the three. Recommend deferring: WebP already solves the
  download-size problem and decodes natively in the browser.

`lib/` currently vendors only plain `babylon.js` + `babylonjs.loaders.min.js` —
**no decoder for meshopt, Draco or KTX2 is present**, which is why Stage A
(needing none) comes first.

### Priority table

Reductions are **estimates from typical results on texture-heavy marketplace
glbs** (gltf-transform/meshoptimizer docs report 60–90 % on such files);
measure each file, do not trust the column.

| File | MB now | Action | Est. after |
| --- | ---: | --- | ---: |
| `free_cliff_rock.glb` | 74.3 | **Do not compress — exclude.** Not loaded by the game (tools only). | 0 (not shipped) |
| `realistic_trees_pack_of_2_free.glb` | 71.3 | Stage A; Stage B meshopt if still >25 MB. **Absurd for two trees — also consider replacing the asset.** | 8–20 |
| `cliff.glb` | 58.1 | Stage A; likely needs Stage B (dense mesh). | 6–15 |
| `desert__rocks__stones__pack.glb` | 26.0 | Stage A | 3–8 |
| `locust_tree_pack.glb` | 20.8 | Stage A | 3–7 |
| `jungle_tree.glb` | 16.2 | Stage A | 2–6 |
| `desert_shrubs.glb` | 10.5 | Stage A | 2–4 |
| `*_hi_anim.glb` dinos (4) | 24.4 | Stage A only — **do NOT simplify/quantise carelessly**: these are baked retargeted rigs (HIPOLY_PIPELINE.md); validate animations after. Consider `--texture-compress webp` only. | 10–16 |

After Stage A across the eight rows above, the payload should land roughly in
the 80–120 MB range. Validate every output in the dino-lab/game before
swapping: quantisation can shift skinned meshes, simplification can hole
foliage cards (`--simplify` respects no alpha cut-outs by default — check the
ferns/leaf planes).

---

## 3. Hosting

**Decision: GitHub Pages**, deploying an allowlisted `dist/` (not the repo root).

- Already wired: `.github/workflows/deploy.yml`, `.nojekyll`, and the
  `og:image` in `index.html` is hard-coded to `scottmatthews7.github.io/saurian/`.
- Fits today **without** compression: largest shipping file 71.3 MB < the
  100 MB/file git hard limit; ~286 MB site < the 1 GB soft limits; 100 GB/month
  soft bandwidth is ample for friends-scale traffic. Free.
- **Cloudflare Pages is blocked today**: 25 MB/file limit — three shipping
  files exceed it (71.3, 58.1, 26.0 MB). Viable only after §2; it would then
  give proper `_headers` control and unmetered bandwidth, so it is the natural
  post-compression upgrade.
- Netlify works (no hard per-file blocker, `_headers` supported) but 286 MB
  uploads on every deploy are slow and it buys nothing over Pages today.
  R2+CDN hybrid is the right answer only if bandwidth ever bites. itch.io is a
  fine **secondary** distribution channel (zip with `index.html` at root) but
  gives no header control and a clunky update loop.

### Runbook (GitHub Pages)

1. Merge to `main`. Confirm `git remote` points at
   `github.com/scottmatthews7/saurian` (public).
2. **Before first real deploy**: change the workflow's
   `upload-pages-artifact` step from `path: "."` to `path: "dist"`, preceded by
   the allowlist copy step described in §5. Publishing the repo root today
   ships ~120 MB of dead weight (74 MB `free_cliff_rock.glb`, 16 MB
   `assets/reference/`, 21 MB `tools/`, design references) to every player-facing
   artefact. *(Workflow edit is outside this audit's writable surface — owner
   or the tools/CI agent to apply.)*
3. GitHub → Settings → Pages → Source = "GitHub Actions" (one-off, may already
   be set per root `DEPLOY.md`).
4. Push; watch the "Deploy to GitHub Pages" action; play
   `https://scottmatthews7.github.io/saurian/`.

**Caching headers**: GitHub Pages is non-configurable — it serves
`Cache-Control: max-age=600` with strong ETags on everything. You cannot set
`immutable`/long max-age. In practice repeat visits cheaply revalidate to
`304 Not Modified`, so the 286 MB is paid roughly once per browser cache, not
per visit. If/when moving to Cloudflare Pages or Netlify post-compression, add
a `_headers` file:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/lib/*
  Cache-Control: public, max-age=31536000, immutable
/src/*
  Cache-Control: public, max-age=300
```

(immutable is only honest if you rename files when they change — fine for
assets, keep `src/`/`index.html` short-lived.)

**Compression on the wire**: glb is binary and served as-is — wire size ≈ disk
size, which is why §2 is the real lever. Text assets (`lib/babylon.js` 8.2 MB,
`src/*.js`, the map JSONs — `map.props.json` is 1.9 MB of highly repetitive
JSON) are gzipped automatically by Pages' CDN (Brotli on hosts that support
it); expect roughly 4–6× on those, no action needed.

### Sanity-check checklist (run against the deployed URL)

- [ ] No port-8011 / `localhost` references in shipping files — **verified
      clean today** (`grep -rn "8011\|localhost\|127.0.0.1\|/Users/" src/ index.html lib/` → no hits).
- [ ] All asset paths relative — **verified**; the only absolute URL is the
      intentional `og:image`. Game must work from the `/saurian/` subpath.
- [ ] Open DevTools → Network: zero 404s (a missing prop glb fails quietly);
      zero requests to non-`github.io` origins (would indicate a CDN-fetched
      decoder slipped in — see §2 loader notes).
- [ ] Console clean: no errors, no CORS or MIME warnings (`.glb`, `.hdr`,
      `.mjs` must all serve — `.nojekyll` must be inside the published `dist/`).
- [ ] Full play loop: spawn → clearing props present → dinos animate → reach
      boat. Test once in a private window (cold cache) and time it.
- [ ] `design/map.grid.json`, `map.props.json`, `map.json` reachable (game
      boot fetches them; missing = blank island).

---

## 4. Runtime budget (50 Mbit/s)

- Today's ~286 MB ≈ 46 s of pure transfer at 50 Mbit/s; realistically
  **60–100 s** with request latency and cache-miss CDN fills. Inside the
  owner's accepted 1–2 min, but with zero headroom — a 25 Mbit connection
  doubles it past budget.
- Post-§2 (~80–120 MB): **15–30 s**. Comfortable.
- **Future work item (do not implement now): ordered preload/streaming.**
  Suggested order: (1) `lib/` + `src/` + the three map JSONs + terrain
  textures + `sky.hdr` (~40 MB → playable terrain); (2) spawn-area set —
  crashed plane, dead pilot, health pack, GPS, jungle tree/ferns/monstera,
  player + raptor models; (3) remaining territory dinos; (4) lazily stream the
  far-biome heavyweights (desert rocks pack, locust trees, realistic trees,
  desert shrubs) behind the loading screen or even after first interactivity.
  `cliff.glb` is the mountain-wall set visible from spawn, so it belongs in
  wave 1–2 — another reason it is the highest-value compression target.

---

## 5. Repo hygiene — published artefact allowlist

Exclude from the published artefact (none of it is fetched by the game):

- `tools/` (21 MB), `design/` **except** `design/map.grid.json`,
  `design/map.props.json`, `design/map.json` (the game fetches these three by
  that exact path, so preserve the `design/` directory in `dist/`)
- `assets/reference/` (16 MB), `assets/audio/candidates/` (1.6 MB),
  `assets/env/sky2.hdr`
- Dead models: `assets/models/free_cliff_rock.glb` (74 MB!),
  `assets/models/triceratops.glb`, `assets/models/apatosaurus.glb`
- Docs and dev surfaces: `HANDOFF.md`, `BRIEF.md`, `DECISIONS.md`,
  `DINO_LAB.md`, `HIPOLY_PIPELINE.md`, `PROGRESS.md`, `USER_WISHLIST.md`,
  `README.md`, `DEPLOY.md`, `LICENSE`*, `CREDITS.md`*, `audio-dashboard.html`,
  `audio-picker.html`, `environment-picker.html`, `layout-designer.html`,
  `.github/`, `.gitignore`
  (*consider shipping LICENSE/CREDITS anyway — several models are CC-BY and
  attribution may be a licence condition; check `CREDITS.md` terms before
  excluding.)

Ship: `index.html`, `landing.html`, `share-card.jpg`, `src/`, `lib/`,
`design/map.{grid,props,}.json` (sic — `map.grid.json`, `map.props.json`,
`map.json`), `assets/models/` (minus the three dead files), `assets/textures/`
(minus `dryground_normal.jpg`/`dryground_roughness.jpg` once verified unused),
`assets/env/sky.hdr`, `assets/audio/` (minus `candidates/`), `.nojekyll`.

**Mechanism (simplest, describe-only): a `tools/make_dist.sh`-style copy
script** — `rm -rf dist && mkdir dist`, then `cp -R`/`rsync -R` the explicit
allowlist above into `dist/`, preserving paths; CI workflow uploads
`path: "dist"`. An allowlist (copy what ships) is strictly safer here than a
denylist (`--exclude`), because new working files appear in the repo root
constantly and a denylist silently ships them. Not implemented — owner sign-off
needed, and the workflow file is outside this audit's writable surface.
