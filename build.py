#!/usr/bin/env python3
"""Build the static showcase site under mobile/for_github/.

Reads the annotated tasks in ../tasks/<NN>/ and emits:
  screens/<NN>/<page>.webp        full-size screenshot (WebP, q82)
  thumbs/<NN>/<page>.webp         gallery thumbnail (width 320)
  data/index.json                 task list + counts
  data/<NN>.json                  per-task pages + annotations

Re-runnable; skips image conversion when the .webp is newer than the .png
(pass --force to rebuild everything).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
TASKS = ROOT.parent / "tasks"

# task id -> (display name, figma file description)
# Only the tasks listed here are published. Others annotated so far:
#   01 Medical / HealthTrack   — ~3.7 annotations/screen, thin
#   03 Home Decor              — exactly 1 annotation/screen, a stub
#   06 Finance Management      — complete
TASK_META = {
    "04": ("Food Delivery", "Food Delivery App UI Kit — ordering & delivery"),
}

ANN_SUFFIX = "_human_interaction_annotation.json"
THUMB_W = 320
FULL_Q = 82
THUMB_Q = 78


def convert(png, out, width, quality, force):
    """Convert png -> webp (optionally downscaled). Returns the source pixel size."""
    with Image.open(png) as im:
        size = im.size
        if not force and out.exists() and out.stat().st_mtime >= png.stat().st_mtime:
            return size
        out.parent.mkdir(parents=True, exist_ok=True)
        img = im.convert("RGB")
        if width and img.width > width:
            img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        img.save(out, "WEBP", quality=quality, method=6)
    return size


def build_task(tid, force):
    tdir = TASKS / tid
    if not tdir.is_dir():
        print(f"  ! {tid}: missing directory", file=sys.stderr)
        return None

    ann_files = sorted(tdir.glob(f"*{ANN_SUFFIX}"))
    if not ann_files:
        print(f"  ! {tid}: no annotations, skipped", file=sys.stderr)
        return None

    selection = {}
    sel_path = tdir / "dataset_selection.json"
    if sel_path.exists():
        selection = json.loads(sel_path.read_text())
    included_set = set(selection.get("included", []))

    pages = []
    for i, af in enumerate(ann_files):
        page = af.name[: -len(ANN_SUFFIX)]
        png = tdir / f"{page}.png"
        if not png.exists():
            print(f"  ! {tid}/{page}: png missing, skipped", file=sys.stderr)
            continue

        data = json.loads(af.read_text())
        w, h = convert(png, ROOT / "screens" / tid / f"{page}.webp", None, FULL_Q, force)
        convert(png, ROOT / "thumbs" / tid / f"{page}.webp", THUMB_W, THUMB_Q, force)

        anns = []
        for a in data.get("annotations", []):
            node = a.get("node") or {}
            anns.append(
                {
                    "id": a.get("id"),
                    "type": a.get("type"),
                    "subtype": a.get("subtype"),
                    "interactable": a.get("interactable"),
                    "note": a.get("note"),
                    "navigateTo": a.get("navigateTo"),
                    "bbox": a.get("bbox_png"),
                    "node": {
                        "id": node.get("id"),
                        "name": node.get("name"),
                        "type": node.get("type"),
                        "depth": node.get("depth"),
                        "x": node.get("x"),
                        "y": node.get("y"),
                        "w": node.get("w"),
                        "h": node.get("h"),
                        "has_interaction": node.get("has_interaction"),
                    },
                }
            )

        pages.append(
            {
                "name": page,
                "included": page in included_set if included_set else bool(data.get("included")),
                "w": w,
                "h": h,
                "figma_meta": data.get("figma_meta"),
                "annotations": anns,
            }
        )
        print(f"\r  {tid}: {i + 1}/{len(ann_files)} pages", end="", flush=True)

    print()
    index = {p["name"]: i for i, p in enumerate(pages)}
    # resolve navigateTo targets that exist in this task, count inbound edges
    inbound = {p["name"]: 0 for p in pages}
    for p in pages:
        for a in p["annotations"]:
            nav = a.get("navigateTo")
            if nav and nav.get("name") in index:
                inbound[nav["name"]] += 1
    for p in pages:
        p["inbound"] = inbound[p["name"]]

    name, desc = TASK_META.get(tid, (f"Task {tid}", ""))
    payload = {"id": tid, "name": name, "description": desc, "pages": pages}
    out = ROOT / "data" / f"{tid}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

    n_ann = sum(len(p["annotations"]) for p in pages)
    by_type = {}
    for p in pages:
        for a in p["annotations"]:
            by_type[a["type"]] = by_type.get(a["type"], 0) + 1
    return {
        "id": tid,
        "name": name,
        "description": desc,
        "pages": len(pages),
        "included": sum(1 for p in pages if p["included"]),
        "annotations": n_ann,
        "by_type": by_type,
        "cover": pages[0]["name"] if pages else None,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-encode images even if up to date")
    ap.add_argument("--tasks", nargs="*", default=sorted(TASK_META), help="task ids to build")
    args = ap.parse_args()

    # drop artifacts of tasks that are no longer published
    for sub in ("screens", "thumbs"):
        for d in (ROOT / sub).glob("*"):
            if d.is_dir() and d.name not in TASK_META:
                print(f"pruning {sub}/{d.name}/")
                for f in d.iterdir():
                    f.unlink()
                d.rmdir()
    for f in (ROOT / "data").glob("*.json"):
        if f.stem not in TASK_META and f.stem != "index":
            print(f"pruning data/{f.name}")
            f.unlink()

    tasks = []
    for tid in args.tasks:
        print(f"building task {tid} …")
        meta = build_task(tid, args.force)
        if meta:
            tasks.append(meta)

    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "index.json").write_text(
        json.dumps({"tasks": tasks}, ensure_ascii=False, indent=2)
    )

    total_px = sum(t["pages"] for t in tasks)
    total_ann = sum(t["annotations"] for t in tasks)
    size = sum(f.stat().st_size for f in ROOT.rglob("*.webp"))
    print(f"\ndone: {len(tasks)} tasks, {total_px} pages, {total_ann} annotations")
    print(f"image payload: {size / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
