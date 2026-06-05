#!/usr/bin/env python3
"""1200x630 og-image.png 생성 — 카카오톡/페북/트위터 링크 공유 미리보기용.
주의: 맑은고딕 등 시스템 폰트엔 컬러 이모지가 없어 □(두부)로 깨짐 → 이모지 미사용."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1200, 630
OUT = Path("D:/politik/og-image.png")

# 폰트 검색 (Windows 기본 한글 폰트들)
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\NanumGothic.ttf",
    r"C:\Windows\Fonts\NanumGothicBold.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
]
def font(size, bold=False):
    for fn in FONT_CANDIDATES:
        if (bold and 'bd' in fn.lower()) or (not bold and 'bd' not in fn.lower()):
            try:
                return ImageFont.truetype(fn, size)
            except Exception:
                continue
    for fn in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(fn, size)
        except Exception:
            continue
    return ImageFont.load_default()

# 배경 (세로 그라데이션)
img = Image.new("RGB", (W, H), "#111827")
draw = ImageDraw.Draw(img)
for y in range(H):
    ratio = y / H
    r = int(0x11 + (0x1f - 0x11) * ratio)
    g = int(0x18 + (0x29 - 0x18) * ratio)
    b = int(0x27 + (0x37 - 0x27) * ratio)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# 좌측 빨간 액센트 바
draw.rectangle([0, 0, 12, H], fill="#ef4444")

# 우상단 빨간 글로우
glow = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(260, 0, -4):
    a = int(26 * (1 - i / 260))
    if a < 1:
        continue
    gd.ellipse([260 - i, 260 - i, 260 + i, 260 + i], fill=(239, 68, 68, a))
img.paste(glow, (W - 360, -200), glow)

def tlen(s, f):
    try:
        return int(draw.textlength(s, font=f))
    except Exception:
        bb = f.getbbox(s)
        return bb[2] - bb[0]

# ── 본문 ──────────────────────────────────────────────
# Eyebrow
draw.text((60, 92), "REPUBLIC OF KOREA · COMPREHENSIVE DATA", font=font(24, bold=True), fill="#9ca3af")

# 메인 타이틀
draw.text((60, 150), "대한민국", font=font(100, bold=True), fill="#ffffff")
draw.text((60, 270), "패치 노트", font=font(100, bold=True), fill="#ffffff")

# 슬로건
draw.text((60, 400), "한국의 모든 것 한 곳에", font=font(36, bold=True), fill="#10b981")
draw.text((60, 452), "정치 · 법안 · 선거 · 경제 · 인물을 데이터로", font=font(22), fill="#d1d5db")

# 우상단 토픽 배지 (텍스트 폭에 맞춰 자동 크기)
badge = "9회 지선 결과"
bf = font(26, bold=True)
bw = tlen(badge, bf) + 44
bx, by = W - 60 - bw, 50
draw.rounded_rectangle([bx, by, bx + bw, by + 60], radius=12, fill="#ef4444")
draw.text((bx + 22, by + 15), badge, font=bf, fill="#ffffff")

# ── 하단 정보 바 ──────────────────────────────────────
foot_y = H - 92
draw.rectangle([0, foot_y, W, H], fill="#0a0e14")

# 좌하단 — 도메인 + 한 줄 설명
draw.text((60, foot_y + 22), "patchkr.com", font=font(30, bold=True), fill="#10b981")
draw.text((60, foot_y + 60), "실시간 국회·경제 데이터 · 22대 통과법안 1,595건 · 무료", font=font(18), fill="#9ca3af")

# 우하단 — 9회 지선 광역단체장 결과 (정당색)
res_x = W - 360
rf = font(27, bold=True)
cx = res_x
for t, c in [("민주 11", "#5aa0ff"), ("  ·  ", "#6b7280"), ("국힘 5", "#ff6b6b")]:
    draw.text((cx, foot_y + 20), t, font=rf, fill=c)
    cx += tlen(t, rf)
draw.text((res_x, foot_y + 60), "9회 지선 광역단체장 결과", font=font(18), fill="#d1d5db")

img.save(OUT, "PNG", optimize=True)
size_kb = OUT.stat().st_size / 1024
print(f"[OK] og-image.png 생성 ({size_kb:.1f} KB, {W}x{H})")
