# -*- coding: utf-8 -*-
"""UI 개편 0단계 — 생성기 6종이 assets/ko-type.css 를 <style id="ko-type"> 로 넣도록 패치(1회용)."""
import io, re, sys
ROOT = 'D:/politik/'
DEF_PY = ('\n# 한국어 줄바꿈(UI 개편 0단계) — 원본은 assets/ko-type.css 하나, 모든 생성기가 같은 블록을 넣는다\n'
          'KO_TYPE_BLOCK = \'<style id="ko-type">\' + (Path(__file__).resolve().parent / "assets/ko-type.css").read_text(encoding="utf-8").strip() + "</style>"\n')

def load(f):
    s = io.open(ROOT + f, encoding='utf-8', newline='').read()
    return s, ('\r\n' if '\r\n' in s else '\n')
def save(f, s):
    io.open(ROOT + f, 'w', encoding='utf-8', newline='').write(s); print('ok', f)
def once(s, a, b, label):
    n = s.count(a)
    if n != 1: sys.exit(f'{label}: {n}회')
    return s.replace(a, b)
def add_def(s, nl, after):
    i = s.index(after) + len(after)
    j = s.index(nl, i)
    return s[:j] + DEF_PY.replace('\n', nl) + s[j:]

# 1) build_law_pages.py — TEMPLATE.format
s, nl = load('build_law_pages.py')
s = add_def(s, nl, 'from pathlib import Path')
s = once(s, '</style></head><body><div class="wrap">', '</style>{ko_type}</head><body><div class="wrap">', 'law tpl')
s = once(s, '        pageHtml = TEMPLATE.format(' + nl, '        pageHtml = TEMPLATE.format(' + nl + '            ko_type=KO_TYPE_BLOCK,' + nl, 'law fmt')
save('build_law_pages.py', s)

# 2) build_static_pages.py — TEMPLATE.format
s, nl = load('build_static_pages.py')
s = add_def(s, nl, 'from pathlib import Path')
s = once(s, '<meta name="robots" content="noindex,follow">' + nl + '</head>', '<meta name="robots" content="noindex,follow">' + nl + '{ko_type}</head>', 'static tpl')
s = once(s, '        html = TEMPLATE.format(' + nl, '        html = TEMPLATE.format(' + nl + '            ko_type=KO_TYPE_BLOCK,' + nl, 'static fmt')
save('build_static_pages.py', s)

# 3·4) build_risk.py / build_law_hot.py — f-string
for f in ('build_risk.py', 'build_law_hot.py'):
    s, nl = load(f)
    s = add_def(s, nl, 'from pathlib import Path')
    a = '</style>' + nl + '</head><body><div class="wrap">'
    s = once(s, a, '</style>{KO_TYPE_BLOCK}' + nl + '</head><body><div class="wrap">', f)
    save(f, s)

# 5) scripts/build-law-radar.js
s, nl = load('scripts/build-law-radar.js')
s = once(s, "const ROOT = path.resolve(__dirname, '..');", "const ROOT = path.resolve(__dirname, '..');" + nl +
         "// 한국어 줄바꿈(UI 개편 0단계) — 원본 assets/ko-type.css" + nl +
         "const KO_TYPE_BLOCK = `<style id=\"ko-type\">${fs.readFileSync(path.join(ROOT, 'assets/ko-type.css'), 'utf8').trim()}</style>`;", 'radar root')
s = once(s, '<style>${style}</style><script defer src="/_vercel/insights/script.js"></script>' + nl + '</head>',
         '<style>${style}</style><script defer src="/_vercel/insights/script.js"></script>${KO_TYPE_BLOCK}' + nl + '</head>', 'radar tpl')
save('scripts/build-law-radar.js', s)

# 6) scripts/build-article.js
s, nl = load('scripts/build-article.js')
s = once(s, "const BASE = 'https://patchkr.com';", "const BASE = 'https://patchkr.com';" + nl +
         "// 한국어 줄바꿈(UI 개편 0단계) — 원본 assets/ko-type.css" + nl +
         "const KO_TYPE_BLOCK = `<style id=\"ko-type\">${fs.readFileSync(path.join(ROOT, 'assets/ko-type.css'), 'utf8').trim()}</style>`;", 'article root')
s = once(s, '${STYLE}</style><script defer src="/_vercel/insights/script.js"></script>${POLISH}' + nl + '</head>',
         '${STYLE}</style><script defer src="/_vercel/insights/script.js"></script>${POLISH}${KO_TYPE_BLOCK}' + nl + '</head>', 'article tpl')
# 날짜 묶기 — 'N월 N일'·'N시 N분'이 두 줄로 갈리지 않게(한국어 기사)
s = once(s, "const inline = (s) => esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\\/b&gt;/g, '</b>');",
         "const glue = (s) => s.replace(/(\\d{1,2}월) (\\d{1,2}일)/g, '<span class=\"nw\">$1 $2</span>').replace(/(\\d{1,2}시) (\\d{1,2}분)/g, '<span class=\"nw\">$1 $2</span>');" + nl +
         "const inline = (s) => glue(esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\\/b&gt;/g, '</b>'));", 'article inline')
save('scripts/build-article.js', s)
