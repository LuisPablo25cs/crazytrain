"""Make web-sized copies of the game artwork. Run after changing anything in assets/train_*.
(Tickets have their own script: tools/assets/prepare-tickets.py.)

Usage: python tools/assets/prepare-art.py   (needs Pillow)

Slots: assets/train_placeholders/<color>_<def|ferry|tunnel>.png
       -> assets/web/slots/<cardColor>_<normal|ferry|tunnel>.webp
Cards: assets/train_cards/<Color>.png and rainbow.png (the locomotive)
       -> assets/web/cards/<cardColor>.webp
UI:    assets/background/background_cards_stack.png -> assets/web/ui/dock.webp (wood behind the card dock)
Pink is the game's "purple" card color; grey or gray both work.
"""
import os
from PIL import Image, ImageFilter

SLOT_SRC, SLOT_OUT, SLOT_SIZE = 'assets/train_placeholders', 'assets/web/slots', (270, 400)
CARD_SRC, CARD_OUT, CARD_SIZE = 'assets/train_cards', 'assets/web/cards', (240, 356)
DOCK_SRC, DOCK_OUT, DOCK_WIDTH = 'assets/background/background_cards_stack.png', 'assets/web/ui/dock.webp', 1600
SLOT_COLORS = {'red': 'red', 'orange': 'orange', 'yellow': 'yellow', 'green': 'green', 'blue': 'blue',
               'pink': 'purple', 'black': 'black', 'white': 'white', 'grey': 'gray', 'gray': 'gray'}
KINDS = {'def': 'normal', 'ferry': 'ferry', 'tunnel': 'tunnel'}
CARDS = {'Red': 'red', 'Orange': 'orange', 'Yellow': 'yellow', 'Green': 'green', 'Blue': 'blue',
         'Pink': 'purple', 'Black': 'black', 'White': 'white', 'rainbow': 'locomotive'}


def save(path, out, size):
    Image.open(path).convert('RGB').resize(size, Image.LANCZOS).save(out, 'WEBP', quality=86, method=6)


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
    written += copy_animations()
    print(f'wrote {written} images to assets/web')
    for m in missing:
        print(f'missing: {m}')


main()
