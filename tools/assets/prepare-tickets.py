"""Make the ticket pictures the game shows, from the Canva ticket designs.

Usage: python tools/assets/prepare-tickets.py   (needs numpy and Pillow)

1. In Canva, download 'tickets-1' and 'tickets-2' as PNG with a transparent background, all pages, and
   unzip them into assets/tickets/tickets-1 and assets/tickets/tickets-2 (Canva names the files 1.png,
   2.png and so on, by page). A zip left in assets/tickets (tickets-1.zip, tickets-2.zip) is unzipped
   for you when it is newer than its folder.
2. Run this script. For every ticket in assets/tickets/tickets.json it cuts the ticket out of its page
   (the white punch holes and edge notches become see-through) and writes
   assets/web/tickets/<ticket-id>.webp, which the server serves at /art/tickets.

The tickets themselves (cities, points, deck) live in the map file; tickets.json is where they came
from, so the map's tickets and these pictures share their ids.
"""
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'tickets')
OUT = os.path.join(ROOT, 'assets', 'web', 'tickets')
OUT_WIDTH = 900  # px; tickets show at most about 400 px wide, so this covers 2x screens


def unzip_newer():
    for f in sorted(os.listdir(SRC)):
        if not f.lower().endswith('.zip'):
            continue
        folder = os.path.join(SRC, f[:-4])
        os.makedirs(folder, exist_ok=True)
        newest = max((os.path.getmtime(os.path.join(folder, p)) for p in os.listdir(folder)), default=0)
        if os.path.getmtime(os.path.join(SRC, f)) <= newest:
            continue
        with zipfile.ZipFile(os.path.join(SRC, f)) as z:
            for info in z.infolist():
                if info.is_dir() or not info.filename.lower().endswith('.png'):
                    continue
                with z.open(info) as src, open(os.path.join(folder, os.path.basename(info.filename)), 'wb') as dst:
                    dst.write(src.read())
        print(f'unzipped {f}')


def cut_ticket(path):
    """The ticket alone: white shapes that touch the outside (punch holes, notches) become see-through."""
    im = Image.open(path).convert('RGBA')
    if np.asarray(im)[..., 3].min() >= 250:
        sys.exit(f'{path}: the picture has no transparency; download it again with "Transparent background"')
    # Trim to the ticket and bring it to its final size first: the rest works on fewer pixels.
    ys, xs = np.nonzero(np.asarray(im)[..., 3] > 8)
    im = im.crop((max(0, xs.min() - 2), max(0, ys.min() - 2), xs.max() + 3, ys.max() + 3))
    if im.width > OUT_WIDTH:
        im = im.resize((OUT_WIDTH, round(im.height * OUT_WIDTH / im.width)), Image.LANCZOS)
    a = np.asarray(im).copy()
    light = a[..., :3].min(axis=2)
    outside = a[..., 3] < 8
    passable = outside | ((light >= 225) & (a[..., 3] > 0))
    # Grow the outside through white paper: white joined to the outside is a hole, not paper
    # (white inside the ticket, such as the flags, is not reached).
    reach = outside
    while True:
        grown = np.asarray(Image.fromarray((reach * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
        grown &= passable
        if (grown == reach).all():
            break
        reach = grown
    # The light anti-aliased rim around each hole goes too.
    rim = np.asarray(Image.fromarray((reach * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    a[(reach | (rim & (light >= 190))), 3] = 0
    ys, xs = np.nonzero(a[..., 3] > 8)
    return Image.fromarray(a).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def main():
    unzip_newer()
    tickets = json.load(open(os.path.join(SRC, 'tickets.json'), encoding='utf-8'))['tickets']
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        os.remove(os.path.join(OUT, old))
    written, missing = 0, []
    for t in tickets:
        path = os.path.join(SRC, t['art'])
        if not os.path.exists(path):
            missing.append(f"{t['id']} ({t['art']})")
            continue
        cut_ticket(path).save(os.path.join(OUT, f"{t['id']}.webp"), 'WEBP', quality=88, method=4)
        written += 1
    print(f'wrote {written} ticket pictures to assets/web/tickets')
    for m in missing:
        print(f'missing picture: {m}')


if __name__ == '__main__':
    main()
