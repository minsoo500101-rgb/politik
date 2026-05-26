#!/usr/bin/env python3
"""1500x500 Buy Me a Coffee 커버 이미지 — patchkr 프로필용

색감:
- 배경: #0a0e14 (다크)
- 강조: #f4b942 (BMC yellow, 커피색)
- 텍스트: #e6edf3 (밝은 회색)
- 보조: #7d858f (어두운 회색)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1500, 500
OUT = Path("D:/politik/bmc-cover.png")

# 폰트 후보 (Windows 한글)
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


# 배경 단색 (다크)
img = Image.new("RGB", (W, H), "#0a0e14")
draw = ImageDraw.Draw(img)

# 미세 그라데이션 (대각선, 거의 안 보일 정도)
for y in range(H):
    ratio = y / H
    r = int(0x0a + (0x14 - 0x0a) * ratio)
    g = int(0x0e + (0x18 - 0x0e) * ratio)
    b = int(0x14 + (0x20 - 0x14) * ratio)
    draw.line([(0, y), (W, y)], fill=(r, g, b))


# 좌측 강조 컬러 바 (BMC 옐로우)
draw.rectangle([0, 0, 12, H], fill="#f4b942")


# === 텍스트 레이아웃 ===
LEFT = 80
TOP_BLOCK_Y = 80

# 1) 로고 박스 (이모지 대신 — 한글 폰트가 이모지를 못 그리는 환경 대응)
LOGO_X, LOGO_Y = LEFT, TOP_BLOCK_Y + 4
LOGO_SIZE = 90
# 노란 박스
draw.rounded_rectangle(
    [LOGO_X, LOGO_Y, LOGO_X + LOGO_SIZE, LOGO_Y + LOGO_SIZE],
    radius=16, fill="#f4b942"
)
# 클립보드 모양 (간단 라인)
# 상단 클립
clip_w = 36
clip_h = 18
clip_x = LOGO_X + (LOGO_SIZE - clip_w) // 2
clip_y = LOGO_Y + 8
draw.rounded_rectangle(
    [clip_x, clip_y, clip_x + clip_w, clip_y + clip_h],
    radius=4, fill="#0a0e14"
)
# 가로줄 3개 (체크리스트 느낌)
for i, dy in enumerate([38, 56, 74]):
    line_w = 50 - i * 6
    draw.rounded_rectangle(
        [LOGO_X + 18, LOGO_Y + dy, LOGO_X + 18 + line_w, LOGO_Y + dy + 5],
        radius=2, fill="#0a0e14"
    )

# 2) 메인 타이틀: "대한민국 패치 노트"
title_font = font(80, bold=True)
draw.text((LEFT + 120, TOP_BLOCK_Y + 5), "대한민국 패치 노트",
          font=title_font, fill="#e6edf3")

# 3) 영문 부제: "Korea Patch Notes"
sub_font = font(28)
draw.text((LEFT + 122, TOP_BLOCK_Y + 100), "KOREA PATCH NOTES",
          font=sub_font, fill="#f4b942")

# 4) 핵심 카피
copy_font = font(36, bold=True)
draw.text((LEFT, TOP_BLOCK_Y + 180),
          "정치 · 법안 · 선거 · 인물을 데이터로",
          font=copy_font, fill="#e6edf3")

# 5) 통계 한 줄
stat_font = font(22)
draw.text((LEFT, TOP_BLOCK_Y + 240),
          "22대 통과 법안 1,595건 · 정치인 744명 · 9회 지선 후보 697명",
          font=stat_font, fill="#7d858f")

# 6) URL (우측 하단)
url_font = font(30, bold=True)
url_text = "patchkr.com"
bbox = draw.textbbox((0, 0), url_text, font=url_font)
tw = bbox[2] - bbox[0]
draw.text((W - tw - 60, H - 60), url_text,
          font=url_font, fill="#f4b942")

# 7) 좌측 하단 한 줄 (운영 원칙)
foot_font = font(18)
draw.text((LEFT, H - 56),
          "객관 수치만 표시 · 평가·해석 없음 · 무료·오픈소스",
          font=foot_font, fill="#4b5563")


# 저장
img.save(OUT, "PNG", optimize=True)
size_kb = OUT.stat().st_size / 1024
print(f"OK: {OUT} ({W}x{H}, {size_kb:.0f} KB)")
