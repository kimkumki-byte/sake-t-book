#!/usr/bin/env python3
"""데모(미리보기) 한 파일 만들기.

서버 없이 브라우저만으로 돌아가는 사케치북 데모 HTML을 만들어요.
배포하기 전에 사용자에게 먼저 보여주는 용도예요.

사용법:  python preview/build-demo.py [출력 파일]   (기본: preview/demo.html)

- 화면: public/style.css + public/app.js (실제 사이트와 같은 코드)
- 계산: lib/core.js (레벨·뱃지·랭킹, 서버와 같은 코드)
- 서버 대신: preview/mock-api.js (예시 데이터, 새로고침하면 처음으로)
- 로고는 data URI로 넣어서 파일 하나로 열려요.
- preview/sample.jpg 가 있으면 첫 번째 예시 사케(닷사이)의 사진으로 써요.
"""
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'preview' / 'demo.html'


def read(p):
    return (ROOT / p).read_text(encoding='utf-8')


def data_uri(path, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode(path.read_bytes()).decode())


css = read('public/style.css')
core = read('lib/core.js')
mock = read('preview/mock-api.js')
app = read('public/app.js').replace('/logo.png', data_uri(ROOT / 'public' / 'logo.png', 'image/png'))
sample = ROOT / 'preview' / 'sample.jpg'
dassai = '"%s"' % data_uri(sample, 'image/jpeg') if sample.exists() else 'null'

FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap'
html = f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>사케치북</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
.pvbar{{max-width:460px;margin:8px auto 4px;padding:7px 12px;border:1px dashed var(--line);border-radius:8px;font-size:12px;color:var(--muted);text-align:center;line-height:1.55}}
.pvbar span,.pvbar b{{color:var(--ink)}}
</style>
</head>
<body>
<div class="pvbar"><b>데모</b> · 예시 데이터 · 새로고침하면 처음으로 돌아가요<br><span>게스트 <b>예시손님 / 1234</b> · 운영자 <b>ADMIN / 아무 비밀번호</b></span></div>
<div id="app"><div class="loading">불러오는 중…</div></div>
<div id="toast" class="toast" role="status" hidden></div>
<script>window.__DASSAI__={dassai};</script>
<script>
{core}
</script>
<script>
{mock}
</script>
<script>
{app}
</script>
</body>
</html>
"""
out.write_text(html, encoding='utf-8')
print(out, len(html))
