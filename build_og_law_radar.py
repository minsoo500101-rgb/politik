#!/usr/bin/env python3
"""og-law-radar.png — '곧 시행되는 법령' 공유 미리보기 배너 (1200x630).

숫자는 data/law/radar.json 실측에서 읽어 굽는다. 링크를 카톡·X에 붙였을 때
"646건 / 3개월 내 435건" 같은 구체적 수가 먼저 보여야 클릭이 붙는다.

⚠ 폰트가 Windows 시스템 한글 폰트라 리눅스 CI에서는 한글이 깨진다.
   → CI에 걸지 말고 로컬에서 만들어 PNG를 커밋할 것.
⚠ 시스템 폰트에 컬러 이모지가 없어 □(두부)로 깨지므로 이모지 미사용.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "og-law-radar.png"
W, H = 1200, 630

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgun.ttf",
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\NanumGothic.ttf",
    r"C:\Windows\Fonts\NanumGothicBold.ttf",
    r"C:\Windows\Fonts\gulim.ttc",
]


def font(size, bold=False):
    for fn in FONT_CANDIDATES:
        if (bold and "bd" in fn.lower()) or (not bold and "bd" not in fn.lower()):
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


# ── 실측 수치 ────────────────────────────────────────────
radar = json.loads((ROOT / "data/law/radar.json").read_text(encoding="utf-8"))
total = radar["total"]
as_of = radar["asOf"]


def daydiff(a, b):
    from datetime import date
    da = date(int(a[:4]), int(a[4:6]), int(a[6:8]))
    db = date(int(b[:4]), int(b[4:6]), int(b[6:8]))
    return (da - db).days


near90 = sum(1 for it in radar["items"] if daydiff(it["ef"], as_of) <= 90)
near30 = sum(1 for it in radar["items"] if daydiff(it["ef"], as_of) <= 30)

# ── 배경 ────────────────────────────────────────────────
img = Image.new("RGB", (W, H), "#0f1115")
draw = ImageDraw.Draw(img)
for y in range(H):
    r = y / H
    draw.line([(0, y), (W, y)],
              fill=(int(0x0f + (0x1b - 0x0f) * r),
                    int(0x11 + (0x20 - 0x11) * r),
                    int(0x15 + (0x2e - 0x15) * r)))

# 좌측 인디고 액센트 바 (사이트 --ac)
draw.rectangle([0, 0, 12, H], fill="#4F46E5")

# 우상단 인디고 글로우
glow = Image.new("RGBA", (560, 560), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(280, 0, -4):
    a = int(30 * (1 - i / 280))
    if a >= 1:
        gd.ellipse([280 - i, 280 - i, 280 + i, 280 + i], fill=(99, 102, 241, a))
img.paste(glow, (W - 380, -210), glow)


def tlen(s, f):
    try:
        return int(draw.textlength(s, font=f))
    except Exception:
        bb = f.getbbox(s)
        return bb[2] - bb[0]


# ── 본문 ────────────────────────────────────────────────
draw.text((60, 78), "대한민국 패치노트 · 법제처 국가법령정보", font=font(23, bold=True), fill="#9aa3b2")

draw.text((60, 128), "이미 공포됐고,", font=font(74, bold=True), fill="#ffffff")
draw.text((60, 216), "시행일만 남았습니다", font=font(74, bold=True), fill="#ffffff")

draw.text((60, 330), "내 업무에 걸리는 것만 골라 보세요", font=font(30, bold=True), fill="#a5b4fc")

# 숫자 3칸 — 이 배너의 핵심
stats = [
    (f"{total}", "공포 완료 · 시행 전", "#ffffff"),
    (f"{near90}", "3개월 내 시행", "#fbbf24"),
    (f"{near30}", "30일 내 시행", "#f87171"),
]
x = 60
for num, lab, col in stats:
    nf = font(58, bold=True)
    draw.text((x, 396), num, font=nf, fill=col)
    nw = tlen(num, nf)
    draw.text((x + nw + 8, 424), "건", font=font(26, bold=True), fill="#9aa3b2")
    draw.text((x, 470), lab, font=font(21), fill="#d1d5db")
    x += max(nw + 60, tlen(lab, font(21)) + 46)

# 우상단 배지
badge = "무료"
bf = font(26, bold=True)
bw = tlen(badge, bf) + 44
bx, by = W - 60 - bw, 52
draw.rounded_rectangle([bx, by, bx + bw, by + 58], radius=12, fill="#4F46E5")
draw.text((bx + 22, by + 14), badge, font=bf, fill="#ffffff")

# ── 하단 바 ─────────────────────────────────────────────
foot_y = H - 88
draw.rectangle([0, foot_y, W, H], fill="#0a0e14")
draw.text((60, foot_y + 20), "patchkr.com/law-radar", font=font(29, bold=True), fill="#818cf8")
draw.text((60, foot_y + 56), "인사·노무 / 안전·보건 / 세무 / 계약 / 건설 / 환경 … 15개 분야", font=font(18), fill="#9aa3b2")

note = "법률 자문 아님 · 정보 제공"
nf2 = font(18)
draw.text((W - 60 - tlen(note, nf2), foot_y + 56), note, font=nf2, fill="#6b7280")

img.save(OUT, "PNG", optimize=True)
print(f"[OK] og-law-radar.png ({OUT.stat().st_size / 1024:.1f} KB, {W}x{H}) "
      f"- {total}건 / 90일 {near90} / 30일 {near30}")
