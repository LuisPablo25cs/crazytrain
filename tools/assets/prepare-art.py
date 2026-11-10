"""Make web-sized copies of the game artwork. Run after changing anything in assets/train_*.

Usage: python tools/assets/prepare-art.py   (needs Pillow)

Slots: assets/train_placeholders/<color>_<def|ferry|tunnel>.png
       -> assets/web/slots/<cardColor>_<normal|ferry|tunnel>.webp
Cards: assets/train_cards/<Color>.png and rainbow.png (the locomotive)
       -> assets/web/cards/<cardColor>.webp
UI:    assets/background/background_cards_stack.png -> assets/web/ui/dock.webp (wood behind the card dock)
Ticket: assets/ticket_template/ticket_template.png (blank ticket) -> assets/web/ui/ticket.webp, background made transparent
Fonts:  assets/fonts/*.woff2|ttf|otf (the ticket number font, Rosella Engraved) -> assets/web/fonts
Pink is the game's "purple" card color; grey or gray both work.
"""
import os
from PIL import Image, ImageFilter

SLOT_SRC, SLOT_OUT, SLOT_SIZE = 'assets/train_placeholders', 'assets/web/slots', (270, 400)
CARD_SRC, CARD_OUT, CARD_SIZE = 'assets/train_cards', 'assets/web/cards', (240, 356)
TICKET_OUT = 'assets/web/ui/ticket.webp'
DOCK_SRC, DOCK_OUT, DOCK_WIDTH = 'assets/background/background_cards_stack.png', 'assets/web/ui/dock.webp', 1600
SLOT_COLORS = {'red': 'red', 'orange': 'orange', 'yellow': 'yellow', 'green': 'green', 'blue': 'blue',
               'pink': 'purple', 'black': 'black', 'white': 'white', 'grey': 'gray', 'gray': 'gray'}
KINDS = {'def': 'normal', 'ferry': 'ferry', 'tunnel': 'tunnel'}
CARDS = {'Red': 'red', 'Orange': 'orange', 'Yellow': 'yellow', 'Green': 'green', 'Blue': 'blue',
         'Pink': 'purple', 'Black': 'black', 'White': 'white', 'rainbow': 'locomotive'}


def save(path, out, size):
    Image.open(path).convert('RGB').resize(size, Image.LANCZOS).save(out, 'WEBP', quality=86, method=6)


def ticket_template():
    """Blank ticket -> transparent, trimmed to the ticket, 1400 wide. Prefers a file named *template*."""
    from PIL import ImageDraw
    src = 'assets/ticket_template'
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.png', '.webp', '.jpg', '.jpeg'))) if os.path.isdir(src) else []
    files = [f for f in files if 'example' not in f.lower()]
    if not files:
        return 0
    files.sort(key=lambda f: 'template' not in f.lower())
    raw = Image.open(os.path.join(src, files[0])).convert('RGBA')
    im = Image.new('RGBA', raw.size, (255, 255, 255, 255))
    im.alpha_composite(raw)
    im = im.convert('RGB')
    # Outside the ticket is plain white: find it by flood fill from the picture's edges.
    # A pixel counts as white only if all three channels are bright.
    r, g, b = [c.point(lambda v: 255 if v >= 238 else 0) for c in im.split()]
    from PIL import ImageChops
    white = ImageChops.multiply(ImageChops.multiply(r, g), b)
    flood = white.copy()
    for seed in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1), (im.width // 2, 0), (im.width // 2, im.height - 1)]:
        if flood.getpixel(seed) == 255:
            ImageDraw.floodfill(flood, seed, 128)
    outside = flood.point(lambda v: 255 if v == 128 else 0).filter(ImageFilter.MaxFilter(3))
    alpha = ImageChops.invert(outside).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 30 else 0).getbbox()
    out = out.crop(box)
    out = out.resize((1400, round(out.height * 1400 / out.width)), Image.LANCZOS)
    os.makedirs(os.path.dirname(TICKET_OUT), exist_ok=True)
    out.save(TICKET_OUT, 'WEBP', quality=90, method=6)
    print(f'ticket template {files[0]} -> {TICKET_OUT} {out.size}')
    return 1


def copy_animations():
    """Disaster GIFs made with the /animations page -> assets/web/animations (shown when a disaster strikes)."""
    import shutil
    src = 'assets/animations'
    if not os.path.isdir(src):
        return 0
    os.makedirs('assets/web/animations', exist_ok=True)
    n = 0
    for f in os.listdir(src):
        if f.endswith('.gif'):
            shutil.copy(os.path.join(src, f), os.path.join('assets/web/animations', f))
            n += 1
    return n


def copy_fonts():
    """Font files in assets/fonts (for example Rosella Engraved) go to assets/web/fonts."""
    import shutil
    src = 'assets/fonts'
    if not os.path.isdir(src):
        return 0
    os.makedirs('assets/web/fonts', exist_ok=True)
    n = 0
    for f in os.listdir(src):
        if f.lower().endswith(('.woff2', '.woff', '.ttf', '.otf')):
            shutil.copy(os.path.join(src, f), os.path.join('assets/web/fonts', f))
            n += 1
    return n


def main():
    os.makedirs(SLOT_OUT, exist_ok=True)
    os.makedirs(CARD_OUT, exist_ok=True)
    written, missing = 0, []
    for src_color, card in SLOT_COLORS.items():
        for src_kind, kind in KINDS.items():
            path = os.path.join(SLOT_SRC, f'{src_color}_{src_kind}.png')
            if os.path.exists(path):
                save(path, os.path.join(SLOT_OUT, f'{card}_{kind}.webp'), SLOT_SIZE)
                written += 1
    for card in sorted(set(SLOT_COLORS.values())):
        for kind in KINDS.values():
            if not os.path.exists(os.path.join(SLOT_OUT, f'{card}_{kind}.webp')):
                missing.append(f'slot {card}_{kind}')
    for name, card in CARDS.items():
        path = os.path.join(CARD_SRC, f'{name}.png')
        if os.path.exists(path):
            save(path, os.path.join(CARD_OUT, f'{card}.webp'), CARD_SIZE)
            written += 1
        else:
            missing.append(f'card {name}.png')
    if os.path.exists(DOCK_SRC):
        os.makedirs(os.path.dirname(DOCK_OUT), exist_ok=True)
        im = Image.open(DOCK_SRC).convert('RGB')
        im = im.resize((DOCK_WIDTH, round(im.height * DOCK_WIDTH / im.width)), Image.LANCZOS)
        im.save(DOCK_OUT, 'WEBP', quality=84, method=6)
        written += 1
    written += ticket_template()
    written += copy_fonts()
    written += copy_animations()
    print(f'wrote {written} images to assets/web')
    for m in missing:
        print(f'missing: {m}')


main()
