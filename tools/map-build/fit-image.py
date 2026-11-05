"""Fit a background map image's projection against Natural Earth coastlines.

Usage: python tools/map-build/fit-image.py <image.png> assets/maps/sources/<map>/land.geojson
Prints the best equirectangular and Mercator fits as [x0, y0, sx, sy] in image pixels, where
x = x0 + sx * (lon + 100) and y = y0 - sy * (lat - 40) (Mercator uses Mercator latitude).
Copy the better fit into the map's meta.json projection. Needs numpy and Pillow.
"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw

img_path, land_path = sys.argv[1], sys.argv[2]
S = 4  # downsample factor
im = np.asarray(Image.open(img_path).convert('RGB')).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
water = (r < 115) & (b > r + 45)
land_img = ~water
H, W = land_img.shape
small = np.asarray(Image.fromarray((land_img * 255).astype('uint8')).resize((W // S, H // S), Image.BILINEAR)) > 127

rings = [f['geometry']['coordinates'][0] for f in json.load(open(land_path))['features']]

def merc(lat):
    return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))

def render(p, kind):
    x0, y0, sx, sy = p
    mask = Image.new('L', (W // S, H // S), 0)
    d = ImageDraw.Draw(mask)
    for ring in rings:
        pts = []
        for lon, lat in ring:
            yy = merc(lat) - merc(40) if kind == 'merc' else lat - 40
            pts.append(((x0 + sx * (lon + 100)) / S, (y0 - sy * yy) / S))
        d.polygon(pts, fill=255)
    return np.asarray(mask) > 127

def score(p, kind):
    m = render(p, kind)
    inter = (m & small).sum(); union = (m | small).sum()
    return inter / union

def optimize(p, kind):
    steps = [20, 20, 1.0, 1.0]
    best = score(p, kind)
    for _ in range(8):
        improved = True
        while improved:
            improved = False
            for i in range(4):
                for sgn in (1, -1):
                    q = list(p); q[i] += sgn * steps[i]
                    s = score(q, kind)
                    if s > best:
                        best, p, improved = s, q, True
        steps = [s / 2 for s in steps]
    return p, best

for kind in ('equirect', 'merc'):
    start = [800, 365, 23.8, 22.5 if kind == 'equirect' else 17.0]
    p, s = optimize(start, kind)
    print(kind, [round(v, 3) for v in p], 'IoU', round(s, 4))
