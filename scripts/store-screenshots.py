#!/usr/bin/env python3
"""Compose App Store and Google Play marketing screenshots from raw device captures.

Usage: python3 scripts/store-screenshots.py <raw-ios-dir> <raw-android-dir>
Outputs to brand/store/ (exact sizes required by each store, RGB PNG, no alpha).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand" / "store"
INK, MUTED, WINE = (63, 38, 35), (109, 82, 80), (166, 75, 67)
TOP, BOTTOM = (249, 225, 220), (250, 245, 244)
SERIF = "/System/Library/Fonts/NewYork.ttf"
SERIF_IT = "/System/Library/Fonts/NewYorkItalic.ttf"
SANS = "/System/Library/Fonts/SFNS.ttf"

# (file, title with *accent*, subtitle)
SCREENS = [
    ("s1-inicio", "Tu comunidad de *fe*, siempre contigo", "Reuniones, devocionales y actividades en un solo lugar."),
    ("s2-reuniones", "Únete a cada *reunión* en un toque", "En tu hora local, con aviso 15 minutos antes."),
    ("s3-devocionales", "Una palabra para *cada día*", "Devocionales escritos por mujeres de la comunidad."),
    ("s4-lectura", "Lee, guarda y *reflexiona*", "Marca tus favoritos y escribe tus notas personales."),
    ("s5-galeria", "Revive cada *encuentro*", "Fotos de nuestras comunidades en Europa, Estados Unidos y República Dominicana."),
    ("s6-cumpleanos", "Celebra a cada *hermana*", "Recordatorios de cumpleaños a la hora que elijas."),
    ("s7-unete", "Forma parte de *Mujeres con Propósito*", "Regístrate en minutos y te acompañamos."),
]


def font(path, size):
    f = ImageFont.truetype(path, size)
    # Text-size optical master and semibold weight read better than the thin display default.
    if path in (SERIF, SERIF_IT):
        f.set_variation_by_axes([36, 600, 0])
    elif path == SANS:
        f.set_variation_by_axes([100, 28, 400, 440])
    return f


def gradient(w, h):
    img = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = min(1, y / (h * 0.75))
        px.line([(0, y), (w, y)], fill=tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3)))
    return img


def layout_title(text, width, size):
    """Word-wrap a title where *words* are italic wine accents; returns lines of (word, accent)."""
    words, accent = [], False
    for chunk in text.split("*"):
        for w in chunk.split():
            words.append((w, accent))
        accent = not accent
    reg, it = font(SERIF, size), font(SERIF_IT, size)
    space = reg.getlength(" ")
    lines, cur, cur_w = [], [], 0
    glued = []
    for w, a in words:
        if glued and w[0] in ",.;:!?":
            glued[-1] = (glued[-1][0] + [(w, a)], glued[-1][1])
        else:
            glued.append(([(w, a)], a))
    def width_of(parts):
        return sum((it if pa else reg).getlength(pw) for pw, pa in parts)
    for parts, _ in glued:
        ww = width_of(parts)
        if cur and cur_w + space + ww > width:
            lines.append(cur); cur, cur_w = [], 0
        cur.append(parts); cur_w += (space if len(cur) > 1 else 0) + ww
    if cur:
        lines.append(cur)
    return lines, reg, it, space


def draw_title(draw, text, cx, y, width, size):
    lines, reg, it, space = layout_title(text, width, size)
    line_h = round(size * 1.12)
    for line in lines:
        total = sum((it if a else reg).getlength(w) for parts in line for w, a in parts) + space * (len(line) - 1)
        x = cx - total / 2
        for parts in line:
            for w, a in parts:
                f = it if a else reg
                draw.text((x, y), w, font=f, fill=WINE if a else INK)
                x += f.getlength(w)
            x += space
        y += line_h
    return y


def draw_sub(draw, text, cx, y, width, size):
    f = font(SANS, size)
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if f.getlength(test) > width and cur:
            lines.append(cur); cur = w
        else:
            cur = test
    lines.append(cur)
    for line in lines:
        draw.text((cx - f.getlength(line) / 2, y), line, font=f, fill=MUTED)
        y += round(size * 1.4)
    return y


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def device(shot, screen_w, bezel, radius):
    """Screenshot inside a dark rounded phone frame with a subtle edge highlight."""
    sw, sh = screen_w, round(shot.height * screen_w / shot.width)
    screen = shot.convert("RGB").resize((sw, sh), Image.LANCZOS)
    fw, fh = sw + bezel * 2, sh + bezel * 2
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle([0, 0, fw - 1, fh - 1], radius=radius + bezel, fill=(28, 24, 26, 255))
    d.rounded_rectangle([2, 2, fw - 3, fh - 3], radius=radius + bezel - 2, outline=(90, 80, 84, 255), width=2)
    frame.paste(screen, (bezel, bezel), rounded_mask((sw, sh), radius))
    return frame


def compose(shot_path, title, sub, W, H, cfg):
    img = gradient(W, H)
    draw = ImageDraw.Draw(img)
    y = draw_title(draw, title, W / 2, cfg["top"], W - cfg["margin"] * 2, cfg["title"])
    draw_sub(draw, sub, W / 2, y + cfg["gap"], W - cfg["margin"] * 2.4, cfg["sub"])
    phone = device(Image.open(shot_path), cfg["screen_w"], cfg["bezel"], cfg["radius"])
    px, py = (W - phone.width) // 2, cfg["device_top"]
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([px + 20, py + 40, px + phone.width - 20, py + phone.height + 10], radius=cfg["radius"], fill=(120, 50, 45, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(cfg["shadow"]))
    base = img.convert("RGBA")
    base.alpha_composite(shadow)
    base.alpha_composite(phone, (px, py))
    return base.convert("RGB")


def feature_graphic():
    W, H = 1024, 500
    img = gradient(W, H)
    draw = ImageDraw.Draw(img)
    flower = Image.open(ROOT / "brand/icono/flor-degradado-512.png").convert("RGBA").resize((300, 300), Image.LANCZOS)
    glow = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    ImageDraw.Draw(glow).ellipse([60, 60, 420, 440], fill=(255, 255, 255, 150))
    base = img.convert("RGBA")
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
    base.alpha_composite(flower, (90, 100))
    draw = ImageDraw.Draw(base)
    draw.text((450, 128), "COMUNIDAD CRISTIANA INTERNACIONAL", font=font(SANS, 20), fill=WINE)
    draw.text((448, 160), "Mujeres con", font=font(SERIF, 64), fill=INK)
    draw.text((448, 232), "Propósito", font=font(SERIF_IT, 64), fill=WINE)
    draw.text((450, 330), "Fe, hermandad y propósito", font=font(SANS, 26), fill=MUTED)
    draw.text((450, 366), "en tu teléfono.", font=font(SANS, 26), fill=MUTED)
    return base.convert("RGB")


def main(raw_ios, raw_android):
    ios_cfg = dict(top=200, margin=100, title=100, sub=46, gap=30, screen_w=980, bezel=26, radius=124, device_top=650, shadow=50)
    and_cfg = dict(top=110, margin=70, title=66, sub=32, gap=20, screen_w=630, bezel=18, radius=34, device_top=470, shadow=36)
    (OUT / "app-store").mkdir(parents=True, exist_ok=True)
    (OUT / "google-play").mkdir(parents=True, exist_ok=True)
    for i, (name, title, sub) in enumerate(SCREENS, 1):
        slug = name.split("-", 1)[1]
        compose(Path(raw_ios) / f"{name}.png", title, sub, 1320, 2868, ios_cfg).save(OUT / "app-store" / f"{i:02d}-{slug}.png", optimize=True)
        compose(Path(raw_android) / f"{name}.png", title, sub, 1080, 1920, and_cfg).save(OUT / "google-play" / f"{i:02d}-{slug}.png", optimize=True)
    feature_graphic().save(OUT / "google-play" / "feature-graphic.png", optimize=True)
    Image.open(ROOT / "brand/app/app-icon-1024.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(OUT / "google-play" / "icon-512.png", optimize=True)
    print("ok", OUT)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
