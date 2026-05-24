#!/usr/bin/env python3
"""1200x630 og-image.png 생성 — 카카오톡/페북/트위터 공유 미리보기용"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import sys

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
    # fallback
    for fn in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(fn, size)
        except Exception:
            continue
    return ImageFont.load_default()

# 배경 (그라데이션)
img = Image.new("RGB", (W, H), "#111827")
draw = ImageDraw.Draw(img)

# 그라데이션 (간단히 가로 줄)
for y in range(H):
    ratio = y / H
    r = int(0x11 + (0x1f - 0x11) * ratio)
    g = int(0x18 + (0x29 - 0x18) * ratio)
    b = int(0x27 + (0x37 - 0x27) * ratio)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# 좌측 빨간 액센트 바
draw.rectangle([0, 0, 12, H], fill="#ef4444")

# 오버레이 — 우상단 빨간 그라데이션 원
for i in range(150, 0, -3):
    alpha = int(20 * (1 - i/150))
    if alpha < 1: continue
    overlay = Image.new("RGBA", (i*2, i*2), (239, 68, 68, alpha))
    img.paste(overlay, (W - 200 + i - i, 50 - i + i), overlay)

# 텍스트
# Eyebrow
draw.text((60, 90), "REPUBLIC OF KOREA · PATCH NOTES", font=font(28, bold=True), fill="#9ca3af")

# 메인 타이틀
draw.text((60, 160), "대한민국", font=font(110, bold=True), fill="#ffffff")
draw.text((60, 290), "패치 노트", font=font(110, bold=True), fill="#ffffff")

# 부제
draw.text((60, 440), "22대 국회 · 통과 법안 1,595건 · 발의자·정당·분야 한눈에", font=font(28), fill="#d1d5db")

# 우측 빨간 LIVE 박스
live_x, live_y = W - 280, 50
draw.rounded_rectangle([live_x, live_y, live_x + 220, live_y + 64], radius=12, fill="#ef4444")
draw.text((live_x + 20, live_y + 16), "🔴 9회 지선 LIVE", font=font(26, bold=True), fill="#ffffff")

# 하단 정보 박스
foot_y = H - 90
draw.rectangle([0, foot_y, W, H], fill="#0a0e14")
draw.text((60, foot_y + 22), "📋 politik-phi.vercel.app", font=font(28, bold=True), fill="#10b981")
draw.text((60, foot_y + 58), "v22.1595 · 실시간 국회 OPEN API 데이터", font=font(18), fill="#9ca3af")

# 우하단 D-day
draw.text((W - 320, foot_y + 22), "🗳 2026.06.03", font=font(26, bold=True), fill="#ffffff")
draw.text((W - 320, foot_y + 58), "제9회 전국동시지방선거", font=font(18), fill="#d1d5db")

img.save(OUT, "PNG", optimize=True)
size_kb = OUT.stat().st_size / 1024
print(f"[OK] og-image.png 생성 ({size_kb:.1f} KB, {W}x{H})")
