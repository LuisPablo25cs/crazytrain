"""Make the city label art the board shows above each city. Run after exporting the Canva design again.

Usage: python tools/assets/prepare-city-labels.py   (needs numpy and Pillow)

1. In Canva, open 'Assets Crazy Train-1' (see assets/city_labels/pages.json) and export ALL pages as PNG,
   with a transparent background. Unzip the files into assets/city_labels/export.
   Each file name must end with its page number (Canva's "1.png", "Assets Crazy Train-1 (40).png" and so on).
2. Run this script. For every page listed in pages.json it cuts out the city name (dropping the round
   city marker and the soft glow), and writes assets/web/cities/<city-id>.webp, which the server serves
   at /art/cities. It also lists cities whose label style says they need art but have none yet.

Which style a city gets comes from assets/city_labels/hazards.json:
  snow        snowstorms likely, any Canadian city, or a US city on the Canada border  (see 'examples' in pages.json)
  volcano     volcano likely                                                            (see pages.json)
  earthquake  earthquake likely                                                         (see pages.json)
  volcano     volcano possible
  tsunami     tsunami likely or possible                                                (see pages.json)
  hurricane   hurricane likely                                                          (Miami's page)
  tornado     tornado likely                                                            (no example yet)
  hurricane   hurricane possible
  tornado     tornado possible
The first rule that matches wins. Pages move around in Canva, so pages.json also keeps each page's
Canva id; refresh the page numbers before exporting if pages were reordered.
"""
import json
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LABELS = os.path.join(ROOT, 'assets', 'city_labels')
EXPORT = os.path.join(LABELS, 'export')
OUT = os.path.join(ROOT, 'assets', 'web', 'cities')
MAP = os.path.join(ROOT, 'assets', 'maps', 'north-america.map.json')
OUT_HEIGHT = 160  # px; the board draws labels about 22-30 px tall, so this covers 2x screens with room to zoom


def label_styles(hazards, cities):
    """city id -> style name, for every city that gets label art."""
    def has(kind, *levels):
        return {c for lvl in levels for c in hazards.get(kind, {}).get(lvl, [])}

    rules = [
        ('snow', has('snowstorm', 'high') | {c['id'] for c in cities if c.get('country') == 'CA'} | set(hazards.get('canadaBorder', []))),
        ('volcano', has('volcano', 'high')),
        ('earthquake', has('earthquake', 'high')),
        ('volcano', has('volcano', 'medium')),
        ('tsunami', has('tsunami', 'high', 'medium')),
        ('hurricane', has('hurricane', 'high')),
        ('tornado', has('tornado', 'high')),
        ('hurricane', has('hurricane', 'medium')),
        ('tornado', has('tornado', 'medium')),
    ]
    styles = {}
    for c in cities:
        for style, members in rules:
            if c['id'] in members:
                styles[c['id']] = style
                break
    return styles


def page_number(name):
    m = re.findall(r'\d+', os.path.splitext(name)[0])
    return int(m[-1]) if m else None


PAGE_W = 1173  # Canva page width in its own pixels; positions in pages.json use this scale
# Fill colors of the round city markers on the label pages (snow, earthquake, volcano, tsunami).
MARKER_FILLS = [(0x52, 0x92, 0xE1), (0xFC, 0xB3, 0x54), (0xDA, 0x55, 0x01), (0xEC, 0xD3, 0x8F)]


def to_rgba(im):
    """(pixels, opaque). Transparent exports pass through; in an opaque export the plain page background becomes transparent."""
    a = np.asarray(im.convert('RGBA'))
    if a[..., 3].min() < 250:
        return a.copy(), False
    from PIL import ImageDraw
    bg = (a[..., :3] >= 236).all(axis=2)
    flood = Image.fromarray((bg * 255).astype(np.uint8)).copy()  # a copy: floodfill must not write into numpy's buffer
    h, w = bg.shape
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood.getpixel(seed) == 255:
            ImageDraw.floodfill(flood, seed, 128)
    out = a.copy()
    out[..., 3] = np.where(np.asarray(flood) == 128, 0, 255).astype(np.uint8)
    return out, True


def components(mask):
    """Connected components of a boolean mask: list of (ys, xs) arrays."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        ys, xs = [], []
        while q:
            y, x = q.popleft()
            ys.append(y)
            xs.append(x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        comps.append((np.array(ys), np.array(xs)))
    return comps


def find_marker(rgba):
    """(cx, cy, r) of the round city marker in image pixels: a solid disc in one of the marker colors."""
    h, w = rgba.shape[:2]
    step = max(1, round(w / 400))
    small = rgba[::step, ::step]
    sw = small.shape[1]
    rgb = small[..., :3].astype(np.int32)
    best = None
    for color in MARKER_FILLS:
        mask = (np.abs(rgb - np.array(color)).sum(axis=2) < 45) & (small[..., 3] > 200)
        for ys, xs in components(mask):
            bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
            if 0.05 * sw <= bw <= 0.2 * sw and 0.75 <= bw / bh <= 1.33 and len(ys) / (bw * bh) >= 0.6:
                if best is None or len(ys) > best[0]:
                    best = (len(ys), (xs.min() + xs.max() + 1) / 2 * step, (ys.min() + ys.max() + 1) / 2 * step, max(bw, bh) / 2 * step)
    if not best:
        return None
    # The colored fill sits inside a thick light ring; the whole marker is about 1.4 times wider than its fill.
    return best[1], best[2], best[3] * 1.4


def cut_label(rgba, opaque, entry):
    """The city name only: drop the round city marker, its soft glow, and anything outside the label."""
    alpha = rgba[..., 3].astype(np.float32)
    h, w = alpha.shape
    k = w / PAGE_W
    yy, xx = np.mgrid[0:h, 0:w]
    if 'marker' in entry:
        ml, mt, ms = entry['marker']
        marker = ((ml + ms / 2) * k, (mt + ms / 2) * k, ms / 2 * k)
    else:
        marker = find_marker(rgba)
    if marker:
        cx, cy, r = marker
        d = np.hypot(xx - cx, yy - cy)
        alpha[d <= r + 14 * k] = 0  # the disc and its stroke
        # Its glow: faint pixels (or, in an opaque export, near-white ones) around it. Solid letters stay.
        light = rgba[..., :3].min(axis=2) >= 200 if opaque else alpha < 200
        alpha[(d <= r * 2.4) & light] = 0
    if 'label' in entry:
        ll, lt, lw, lh = entry['label']
        pad = 0.03 * PAGE_W
        box = (xx >= (ll - pad) * k) & (xx <= (ll + lw + pad) * k) & (yy >= (lt - pad) * k) & (yy <= (lt + lh + pad) * k)
        alpha[~box] = 0
    # Keep solid shapes plus a thin rim (soft edges, shadows); drop stray faint pixels.
    strong = Image.fromarray(((alpha >= 96) * 255).astype(np.uint8))
    if not np.asarray(strong).any():
        return None
    near = np.asarray(strong.filter(ImageFilter.MaxFilter(max(3, round(6 * k)) | 1))) > 0
    out = rgba.copy()
    out[..., 3] = np.where(near, alpha, 0).astype(np.uint8)
    ys, xs = np.nonzero(out[..., 3] > 8)
    return Image.fromarray(out).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def main():
    hazards = json.load(open(os.path.join(LABELS, 'hazards.json'), encoding='utf-8'))
    raw = json.load(open(os.path.join(LABELS, 'pages.json'), encoding='utf-8'))['pages']
    entries = {int(k): (v if isinstance(v, dict) else {'city': v}) for k, v in raw.items()}
    pages = {p: e['city'] for p, e in entries.items()}
    cities = json.load(open(MAP, encoding='utf-8'))['cities']
    ids = {c['id'] for c in cities}
    for cid in pages.values():
        if cid not in ids:
            sys.exit(f'pages.json: unknown city id {cid}')
    files = {}
    if os.path.isdir(EXPORT):
        for f in os.listdir(EXPORT):
            if f.lower().endswith(('.png', '.webp')) and page_number(f) is not None:
                files[page_number(f)] = os.path.join(EXPORT, f)
    os.makedirs(OUT, exist_ok=True)
    written = 0
    for page, cid in sorted(pages.items()):
        path = files.get(page)
        if not path:
            continue
        label = cut_label(*to_rgba(Image.open(path)), entries[page])
        if label is None:
            print(f'page {page} ({cid}): blank, skipped')
            continue
        if label.height > OUT_HEIGHT:  # never enlarge: a small export stays as sharp as it is
            label = label.resize((max(1, round(label.width * OUT_HEIGHT / label.height)), OUT_HEIGHT), Image.LANCZOS)
        label.save(os.path.join(OUT, f'{cid}.webp'), 'WEBP', quality=90, method=6)
        written += 1
    print(f'wrote {written} city labels to assets/web/cities')
    styles = label_styles(hazards, cities)
    have = {os.path.splitext(f)[0] for f in os.listdir(OUT)}
    for cid, style in sorted(styles.items(), key=lambda kv: (kv[1], kv[0])):
        if cid not in have:
            where = next((p for p, c in pages.items() if c == cid), None)
            print(f'missing: {cid} ({style}' + (f', Canva page {where})' if where else ', no Canva page yet)'))
    for cid in sorted(set(pages.values()) - set(styles)):
        print(f'note: {cid} has art but no label style in hazards.json')


if __name__ == '__main__':
    main()
