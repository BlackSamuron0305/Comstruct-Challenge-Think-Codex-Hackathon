"""Generate Comstruct logo icons at all required sizes from the SVG design."""
from PIL import Image, ImageDraw
import os, sys

# ── Colours ──────────────────────────────────────────────────────
BG   = (11, 59, 78)        # dark teal background  (#0B3B4E)
FACE = (243, 244, 246)     # white-ish face fill    (#F3F4F6)
GOLD = (242, 201, 76)      # golden triangle        (#F2C94C)
EDGE = (11, 59, 78)        # edges same as background


def _scale(coords, s, ox, oy):
    return [(x * s + ox, y * s + oy) for x, y in coords]


def render_icon(sz: int, maskable: bool = False) -> Image.Image:
    """
    Render the icosahedron logo at *sz*×*sz*.
    When *maskable* is True, the icon is inset to 66 % so the safe-zone (80 %)
    stays well inside.
    """
    # Render at 8× for anti-aliasing, then down-scale
    SUPERSAMPLE = 8
    big = sz * SUPERSAMPLE
    s   = big / 128.0
    ox  = 18 * s
    oy  = 18 * s

    if maskable:
        # Shrink the drawing so it fits inside the 80 % safe zone
        inner = 0.60
        margin = (1.0 - inner) / 2.0
        s  *= inner
        ox  = ox * inner + margin * big
        oy  = oy * inner + margin * big

    p = lambda coords: _scale(coords, s, ox, oy)

    img  = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded rect
    rx = int(16 * s) if not maskable else 0
    if maskable:
        draw.rectangle([0, 0, big - 1, big - 1], fill=BG)
    else:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=rx, fill=BG)

    # ── Triangular faces ────────────────────────────────────────
    white_faces = [
        [(30, 0), (0, 18),  (42, 15)],
        [(33, 0), (54, 15), (75, 18)],
        [(0, 22), (42, 18), (30, 57)],
        [(54, 19),(75, 18), (75, 57)],
        [(30, 57),(0, 22),  (13, 56)],
        [(0, 59), (31, 63), (41, 76)],
        [(34, 63),(75, 59), (45, 78)],
    ]
    for face in white_faces:
        draw.polygon(p(face), fill=FACE)

    # Gold / yellow face
    draw.polygon(p([(34, 57), (75, 53), (50, 16)]), fill=GOLD)

    # ── Edge lines (internal structure) ─────────────────────────
    lw = max(2, int(3 * s))

    # Hexagonal ring
    ring = p([(0, 22), (42, 18), (54, 19), (75, 57), (34, 63), (30, 57)])
    for i in range(len(ring)):
        draw.line([ring[i], ring[(i + 1) % len(ring)]], fill=EDGE, width=lw)

    # Diagonals & connectors
    for a, b in [
        ((42, 18), (30, 57)),
        ((54, 19), (34, 63)),
        ((30, 0),  (54, 19)),
        ((13, 56), (41, 76)),
        # Outer top edges
        ((30, 0),  (0, 18)),
        ((33, 0),  (75, 18)),
        # Outer bottom edges
        ((0, 59),  (41, 76)),
        ((75, 59), (45, 78)),
        ((41, 76), (45, 78)),
        # Outer side edges
        ((0, 18),  (0, 22)),
        ((0, 55),  (0, 59)),
        ((75, 18), (75, 53)),
        ((75, 55), (75, 59)),
    ]:
        pa = (a[0] * s + ox, a[1] * s + oy)
        pb = (b[0] * s + ox, b[1] * s + oy)
        draw.line([pa, pb], fill=EDGE, width=lw)

    # Down-scale with high-quality resampling
    return img.resize((sz, sz), Image.LANCZOS)


# ── Output matrix ────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

targets = [
    # Flutter web
    ("apps/mobile/web/favicon.png",                     32,  False),
    ("apps/mobile/web/icons/Icon-192.png",             192,  False),
    ("apps/mobile/web/icons/Icon-512.png",             512,  False),
    ("apps/mobile/web/icons/Icon-maskable-192.png",    192,  True),
    ("apps/mobile/web/icons/Icon-maskable-512.png",    512,  True),
    # Android mipmap (launcher icon)
    ("apps/mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png",    48, False),
    ("apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png",    72, False),
    ("apps/mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png",   96, False),
    ("apps/mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144, False),
    ("apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",192, False),
]

def main():
    for rel, sz, maskable in targets:
        path = os.path.join(BASE, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img = render_icon(sz, maskable=maskable)
        img.save(path, "PNG")
        print(f"  ✓ {rel}  ({sz}×{sz}{'  maskable' if maskable else ''})")

    # Favicon ICO for React web app (multi-size)
    ico_path = os.path.join(BASE, "apps", "web", "public", "favicon.ico")
    sizes = [16, 32, 48]
    icos = [render_icon(s) for s in sizes]
    icos[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes],
                 append_images=icos[1:])
    print(f"  ✓ apps/web/public/favicon.ico  ({'/'.join(str(s) for s in sizes)})")

    print("\nDone – all icons generated.")


if __name__ == "__main__":
    main()
