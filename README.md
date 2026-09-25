# Anchor Tasks — Interaction Annotation Explorer

A static site for browsing human interaction annotations over mobile and web
UI screens extracted from Figma community UI kits. Publishing 10 tasks — 8
mobile apps (Medical/HealthTrack, Fitness/Workout, Home Decor, Food Delivery,
Recipe/Cooking, Finance Management, AI Chat/Bot Creator, Shopping) and 2 web
apps (Newsletter/Blog, Real Estate Listings) — 657 annotated screens, 6173
annotations in total.

- **Gallery** — every annotated screen of an app, with its interactive regions
  outlined on the thumbnail.
- **Screen detail** — the full screenshot with one box per annotation, colour
  coded by interaction type.
- **Hover a box** — a tooltip shows the raw annotation fields (`type`,
  `subtype`, `interactable`, `note`, `navigateTo`, the source Figma `node`, and
  `bbox_png`).
- **Click a `navigate` box** — jumps straight to the target screen, so the whole
  navigation graph is walkable.
- **Reached from** — the reverse edges into the current screen.

## Contents

| Path | What it is |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | the site (vanilla JS, no build step, no dependencies) |
| `data/index.json` | task list and aggregate counts |
| `data/<task>.json` | per-task screens + annotations |
| `screens/<task>/<page>.webp` | full-resolution screenshot |
| `thumbs/<task>/<page>.webp` | 320px gallery thumbnail |
| `build.py` | regenerates `data/`, `screens/` and `thumbs/` from `../tasks/` (mobile) and `../../web/tasks/` (web) |

## Run locally

Any static file server works — the site fetches JSON, so `file://` will not do:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish on GitHub Pages

Push this directory as the repository root, then in **Settings → Pages** choose
*Deploy from a branch*, branch `main`, folder `/ (root)`. `.nojekyll` keeps
Jekyll from touching the asset directories. The included workflow at
`.github/workflows/pages.yml` does the same thing via Actions if you prefer that
route (enable it by selecting *GitHub Actions* as the Pages source).

## Rebuild the data

`build.py` reads annotated tasks from two layouts, keyed by each entry's
`platform` in `TASK_META`:

- **mobile** — `../tasks/<NN>/` — `*.png` screens and their
  `*_human_interaction_annotation.json` siblings side by side, plus an
  optional `dataset_selection.json` for the in-dataset flag.
- **web** — `../../web/tasks/<id>/` — screens in `pages/*.png`, annotations in
  `interaction/*_human_interaction_annotation.json`. No curation pass exists
  for web tasks yet, so every page is published as in-dataset.

```sh
python3 build.py                      # incremental: re-encodes only changed screenshots
python3 build.py --force              # re-encode everything
python3 build.py --tasks 04           # a single task (or a subset, space-separated)
python3 build.py --tasks 1_newsletter # works the same for web task ids
```

Requires [Pillow](https://pillow.readthedocs.io/). Add new tasks to the
`TASK_META` table at the top of the script.

## Annotation schema

Each entry in a screen's `annotations` array:

| Field | Meaning |
| --- | --- |
| `id` | annotation id, unique within the screen |
| `type` | `navigate`, `click`, `input`, `toggle`, `scroll`, `other` |
| `subtype` | refinement for clicks — `click_popout`, `click_social_oauth`, `click_upload_file`, `click_external` |
| `interactable` | whether the region is actually interactive |
| `note` | the anchor tag, e.g. `<get_start>` — the stable id used for scoring |
| `navigateTo` | `{name, idx}` of the destination screen, for `navigate` entries |
| `node` | the source Figma node: `id`, `name`, `type`, `depth`, and its canvas rect |
| `bbox_png` | the region in screenshot pixel coordinates |

Screenshot coordinates are pixels in the exported PNG; the site converts them to
percentages so overlays stay aligned at any display size.
