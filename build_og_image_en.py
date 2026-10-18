#!/usr/bin/env python3
"""1200x630 og-image-en.png — 영어판(/en, Korea, Explained) 공유 미리보기 전용(UI 개편 4단계).
한국어 og-image.png 는 '대한민국 패치노트' 한글 로고라 영어 링크를 공유하면 외국 독자가 읽을 수 없었다.
글꼴: Windows 는 Segoe UI, CI(리눅스)는 DejaVu Sans. 이모지는 쓰지 않는다(시스템 폰트에서 깨짐)."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent
W, H = 1200, 630
OUT = ROOT / "og-image-en.png"

CANDIDATES = {
    "bold": [r"C:\Windows\Fonts\segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "semi": [r"C:\Windows\Fonts\seguisb.ttf", r"C:\Windows\Fonts\segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "reg": [r"C:\Windows\Fonts\segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
}
def font(kind, size):
    for fn in CANDIDATES[kind]:
        try:
            return ImageFont.truetype(fn, size)
        except Exception:
            continue
    return ImageFont.load_default()

BG, INK, DIM, ACCENT, RULE = "#111215", "#ecedf0", "#a5a9b3", "#8e96ff", "#2c2f36"
img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 왼쪽 세로 막대 — 사이트 강조색, 각진 모서리(사이트 톤)
d.rectangle([0, 0, 12, H], fill=ACCENT)

d.text((72, 70), "KOREA PATCH NOTES", font=font("semi", 26), fill=DIM)
d.text((72, 118), "Korea, Explained", font=font("bold", 92), fill=INK)
d.text((72, 240), "Sourced explainers on South and North Korea,", font=font("reg", 34), fill=DIM)
d.text((72, 284), "built on official data.", font=font("reg", 34), fill=DIM)

# 주제 칩 — 영어 허브 3묶음의 대표 글
topics = ["Yoon Suk Yeol trials", "North Korea's military", "Birth rate", "Chip exports"]
x, y = 72, 372
cf = font("semi", 26)
for t in topics:
    tw = int(d.textlength(t, font=cf))
    if x + tw + 44 > W - 72:
        x, y = 72, y + 64
    d.rectangle([x, y, x + tw + 36, y + 48], outline=RULE, width=2)
    d.text((x + 18, y + 8), t, font=cf, fill=INK)
    x += tw + 36 + 14

d.line([72, H - 96, W - 72, H - 96], fill=RULE, width=2)
d.text((72, H - 78), "patchkr.com/en", font=font("bold", 30), fill=ACCENT)
rt = "Neutral · sourced · free"
d.text((W - 72 - int(d.textlength(rt, font=font("reg", 26))), H - 74), rt, font=font("reg", 26), fill=DIM)

img.save(OUT, "PNG", optimize=True)
print(f"ok {OUT.name} {OUT.stat().st_size // 1024}KB")
