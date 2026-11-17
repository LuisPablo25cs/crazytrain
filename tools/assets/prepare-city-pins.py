"""Make the Seasons-mode city art: each city's name lettering, plus the colors of the marker the board draws under it.

Usage: python tools/assets/prepare-city-pins.py   (needs numpy and Pillow)

The Canva design 'Assets Crazy Train-1' (pages 40-98) holds the name lettering only; the round city marker
is no longer part of the art, the board draws it itself so every city gets the same marker size and the
same gap between marker and name.

1. In Canva: Share > Download > PNG, "Transparent background", pages 40-98. Save the zip as
   assets/city_placeholders/Assets Crazy Train-1.zip (this script unzips it into the folder next to it).
2. Run this script. It reads the pictures listed by assets/city_placeholders/cities.json and writes into
   assets/web/city-pins:
     <city-id>-name.webp   the name lettering, trimmed to its edges
     index.json            per city: the name picture's size and the marker's fill and ring colors
Classic mode does not use these (it keeps assets/web/cities).
"""
import json
import os
import re
import sys
import unicodedata
import zipfile

import numpy as np
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'city_placeholders')
OUT = os.path.join(ROOT, 'assets', 'web', 'city-pins')
MAP = os.path.join(ROOT, 'assets', 'maps', 'north-america.map.json')
NAME_HEIGHT = 160  # px, at most; the board draws names about 15-25 px tall


def plain(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn').lower().strip()


def unzip_export(cfg):
    """Unpack the Canva zip into the placeholder folder when it is newer than what is there."""
    zpath = os.path.join(SRC, cfg['folder'] + '.zip')
    folder = os.path.join(SRC, cfg['folder'])
    if not os.path.exists(zpath):
        return
    os.makedirs(folder, exist_ok=True)
    newest = max((os.path.getmtime(os.path.join(folder, f)) for f in os.listdir(folder)), default=0)
    if os.path.getmtime(zpath) <= newest:
        return
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            if info.is_dir() or not info.filename.lower().endswith('.png'):
                continue
            with z.open(info) as src, open(os.path.join(folder, os.path.basename(info.filename)), 'wb') as dst:
                dst.write(src.read())
    print(f'unzipped {os.path.basename(zpath)}')


def cut_name(path):
    """The lettering alone, trimmed to its visible edges. None if the picture is blank."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)
    if a[..., 3].min() >= 250:
        sys.exit(f'{os.path.basename(path)}: the picture has no transparency; download it again with "Transparent background"')
    ys, xs = np.nonzero(a[..., 3] > 8)
    if not len(ys):
        return None
    name = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if name.height > NAME_HEIGHT:  # never enlarge
        name = name.resize((max(1, round(name.width * NAME_HEIGHT / name.height)), NAME_HEIGHT), Image.LANCZOS)
    return name


def main():
    cfg = json.load(open(os.path.join(SRC, 'cities.json'), encoding='utf-8'))
    unzip_export(cfg)
    folder = os.path.join(SRC, cfg['folder'])
    colors = cfg['markerColors']
    markers = cfg['markers']
    cities = json.load(open(MAP, encoding='utf-8'))['cities']
    by_name = {plain(c['name']): c['id'] for c in cities}
    ids = {c['id'] for c in cities}
    sources = {}
    problems = []
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith('.png') or f in cfg.get('skip', {}):
            continue
        if f in cfg['files']:
            sources[cfg['files'][f]] = f
            continue
        m = re.match(r'TODO (.+?) \(', f)
        if not m:
            problems.append(f'{f}: not listed in cities.json')
            continue
        cid = by_name.get(plain(m.group(1)))
        if not cid:
            problems.append(f'{f}: no city called "{m.group(1)}"')
            continue
        sources.setdefault(cid, f)
    for cid in sources:
        if cid not in ids:
            sys.exit(f'cities.json: unknown city id {cid}')

    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        os.remove(os.path.join(OUT, old))
    index = {}
    for cid, f in sorted(sources.items()):
        style = markers.get(f)
        if style not in colors:
            problems.append(f'{f}: no marker color in cities.json "markers"')
            continue
        name = cut_name(os.path.join(folder, f))
        if name is None:
            problems.append(f'{f}: blank picture')
            continue
        name.save(os.path.join(OUT, f'{cid}-name.webp'), 'WEBP', quality=90, method=4)
        index[cid] = {'name': [name.width, name.height], 'fill': colors[style]['fill'], 'ring': colors[style]['ring']}
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, indent=1, sort_keys=True)
    print(f'wrote {len(index)} city pins to assets/web/city-pins')
    for f, why in cfg.get('skip', {}).items():
        print(f'skipped: {f} ({why})')
    for p in problems:
        print(f'problem: {p}')
    missing = sorted(c['name'] for c in cities if c['id'] not in index)
    print(f'no placeholder yet ({len(missing)}): {", ".join(missing)}')


if __name__ == '__main__':
    main()
