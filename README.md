# Mobile Anchor Tasks — Interaction Annotation Explorer

A static site for browsing human interaction annotations over mobile UI screens
extracted from Figma community UI kits. Currently publishing task 04 (Food
Delivery): 73 annotated screens, 791 annotations, 439 navigation edges.

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
| `build.py` | regenerates `data/`, `screens/` and `thumbs/` from `../tasks/` |

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

`build.py` reads the annotated tasks in `../tasks/<NN>/` — the `*.png` screens
and their `*_human_interaction_annotation.json` siblings, plus
`dataset_selection.json` for the in-dataset flag.

```sh
python3 build.py            # incremental: re-encodes only changed screenshots
python3 build.py --force    # re-encode everything
python3 build.py --tasks 04 # a single task
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
