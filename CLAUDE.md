# 사케치북 (sake-t-book) — Claude 작업 안내

이 파일은 Claude(Claude Code 포함)가 이 프로젝트를 이어서 작업할 때 먼저 읽는 안내서예요.
지금까지의 결정·구조·작업 방식·배포 방법이 모두 여기 있어요.

## 0. 사용자와 대화하는 법

- 사용자는 **코딩 초보 기획자(JS)**. 모든 답은 **한국어**, 쉬운 말, 단계별로. 전문 용어는 풀어서.
- 이름은 **sake-t-book**으로 통일 (GitHub·Vercel·Supabase 모두). `sakechibuk` 이라는 이름은 쓰지 않는다.
- 서비스 이름은 **사케치북**, 입장 화면 문구는 "기억력 한계를 극복하기 위한 사케 기록장".
- 사용자는 결과를 원한다. 과정 나열보다 "무엇이 바뀌었고, 무엇을 확인하면 되는지"를 짧게.
- 확인 못 한 부분(예: 로그인이 필요한 실제 화면)은 확인 못 했다고 솔직하게 말하고 확인을 부탁한다.

## 1. 반드시 지킬 작업 순서

1. 요청대로 소스를 고친다.
2. `npm test` — **모두 통과**해야 한다. 새 기능에는 테스트를 추가한다(서버 API + 화면 둘 다).
3. **데모 먼저 보여주기** (사용자 규칙: "배포하기 전에 데모 버전 보여줘야 해")
   - `python preview/build-demo.py` → `preview/demo.html` (브라우저로 바로 열림, 서버 없이 동작)
   - 서버(routes/)에 기능을 추가했다면 `preview/mock-api.js`에도 같은 동작을 넣어야 데모에 보인다.
   - 사용자에게 데모를 보여주고 **"좋아/배포해" 같은 확인을 받은 뒤에만** 배포한다.
4. 데이터베이스 변경이 있으면 **배포 전에** SQL을 Supabase에 실행한다 (아래 4장).
5. 배포한다 (아래 3장) → 실제 사이트에서 확인한다.

## 2. 주소·계정 (비밀값은 절대 코드/채팅에 넣지 않기)

| 항목 | 값 |
|---|---|
| 사이트 | https://sake-t-book.vercel.app |
| GitHub | https://github.com/kimkumki-byte/sake-t-book (Private, 기본 브랜치 `main`) |
| Supabase | 프로젝트 `sake-t-book`, ref `dvxffqzkrbuagkiigmcd`, 서울 리전, **무료 플랜** |
| Vercel | 프로젝트 `sake-t-book`, Hobby(무료), 함수 리전 `icn1`(서울) |

Vercel 환경변수(값은 Vercel에만 있음, 사용자가 직접 입력·관리):
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`(sb_secret_…), `SESSION_SECRET`, `ADMIN_PASSWORD` (선택: `ADMIN_ID`=ADMIN, `ADMIN_NICK`=아무개)

- 비밀번호·비밀 키는 **Claude가 대신 입력하지 않는다.** 사용자가 직접 넣게 안내한다.
- 운영자 계정: 아이디 `ADMIN`, 닉네임 `아무개`(닉네임 옆 파란 인증 마크). 비밀번호는 Vercel 환경변수에만.
- 유료 플랜(Vercel Pro·Supabase Pro)은 비싸서 쓰지 않기로 결정. 무료로 해결한다.

## 3. 배포 방법 (Claude가 직접)

GitHub `main`에 올리면 Vercel이 1~2분 안에 자동 배포한다.

**처음 한 번 (이 폴더에 `.git`이 없으면 — 2026-11-26에 연결 완료, 이제 평소 배포만 하면 됨)** — 이 폴더는 파일만 복사된 상태라 git 연결부터 한다.
파일 내용은 그대로 두고 GitHub 기록만 연결하는 방법이다:

```bash
git init -b main
git remote add origin https://github.com/kimkumki-byte/sake-t-book
git fetch origin
git reset origin/main          # 파일은 그대로, 기록만 GitHub와 맞춤 (--hard 쓰지 말 것)
git status                     # GitHub보다 새로 바뀐 파일(CLAUDE.md, preview/ 등)이 보이면 정상
```
그다음 사용자에게 데모·확인을 받은 뒤 아래 순서로 올린다. (git이 없으면 사용자에게 "Git for Windows" 설치를 안내: https://git-scm.com)

평소 배포:

```bash
git pull origin main            # 먼저 최신으로
npm test                        # 모두 통과 확인
git add -A
git commit -m "무엇을 바꿨는지 한 줄"
git push origin main
```

배포 확인:
- `gh api repos/kimkumki-byte/sake-t-book/commits/<커밋>/status` → `success`면 배포 완료 (gh가 있을 때)
- 또는 https://sake-t-book.vercel.app/api/ping → `{"ok":true}` (서버+DB 정상)
- `/api/me` → 200 이면 서버 정상. 로그인 필요한 API는 비로그인 시 401이 정상.

Windows에서 처음 push할 때: Git for Windows의 로그인 창(Git Credential Manager)이 뜨면 사용자가 GitHub로 로그인. 또는 `gh auth login`.

**API 파일을 지우거나 이름을 바꿀 때 주의**: 예전에 사용자가 GitHub 웹 업로드로 배포하던 시절엔 파일 삭제가 안 됐다. 지금은 git으로 push하므로 `git rm`이 그대로 반영된다.

## 4. 데이터베이스 바꾸기 (Supabase)

- 새 SQL은 `supabase/update-<번호>-<이름>.sql` 로 만들고, **`supabase/schema.sql`(새로 설치용 전체본)에도 똑같이 추가**한다.
- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run. 사용자가 하거나, Claude가 브라우저로 한다
  (SQL Editor는 Monaco 편집기라 `monaco.editor.getModels()[0].setValue(sql)`로 넣고 Run 버튼을 누르면 정확하다).
- 규칙: 모든 표는 **RLS 켜고 정책 없음** (서버의 비밀 키만 접근). 함수는 `security definer` + `revoke execute … from public, anon, authenticated` + `grant … to service_role`.
- 실행 후 확인 예: `select has_function_privilege('anon','public.set_osul(date,bigint[])','execute')` → false 여야 함.
- 지금까지 실행한 것: update-2(술 설명), 3(별점), 4(반 별점), 5(MY·찜·닉네임 변경/탈퇴 함수), 6(오술), 7(리뷰 여러 번·처음 쓴 날짜), 8(마신 온도·로그인 잠금·사케 요청) — **모두 실행 완료**(7·8은 2026-11-26). 실행 후 확인: `select count(*) from pg_constraint where conrelid='public.ratings'::regclass and contype='u'` → 0

표: `guests`(nickname, nick_key=소문자, pw_hash), `sakes`, `ratings`(같은 사케 여러 개 가능, v[5], comment, stars numeric(2,1), drank_on, created_at=처음 쓴 시각, updated_at=고친 시각), `wishes`, `osul`(day, sake_id, pos).
표(update-8): `login_fails`(key='g:닉네임소문자' 또는 'admin', fails, locked_until), `requests`(nickname, name 80자, note 200자, done), `ratings.temp`(cold·room·warm·hot, 비워도 됨).
함수: `rename_guest`, `delete_guest`(update-8부터 requests·login_fails도 함께), `set_osul`.

## 5. 구조

| 경로 | 역할 |
|---|---|
| `public/` | 화면: `index.html`, `app.js`(한 파일 SPA, 해시 라우팅), `style.css`, `logo.png` |
| `api/[route].js` | **서버 함수는 이것 하나**. `/api/<이름>` 을 `routes/<이름>.js`로 보낸다 (콜드 스타트 1번으로 모든 탭 처리 → 속도) |
| `routes/` | me, auth, home, sakes, sake, rate, ranking, my, wish, osul, ping, admin(운영자: 손님 목록·비번 초기화·백업), request(사케 요청) |
| `lib/core.js` | 레벨·뱃지·랭킹·홈·MY·비슷한 친구 계산. **서버와 데모가 같이 쓴다** (window.SKCORE / module.exports) |
| `lib/store.js` | DB 연결. 무거운 supabase-js 대신 **Node 기본 fetch로 PostgREST 직접 호출** (속도). 테스트에선 `tests/fake-store.js`로 바뀐다 |
| `lib/auth.js` | 로그인 쿠키 `sk` (직접 구현한 HS256 JWT, HttpOnly/SameSite=Lax/Secure, 30일), `requireLiveSession`/`assertLive` |
| `lib/validate.js` | 입력 검사 (닉네임, 비번, 별점 0.5~5 반 단위, 날짜 등) |
| `lib/http.js` | handler 래퍼, CSRF 헤더 검사(`X-Requested-With: sakechibuk` — 내부 값이라 그대로 둔다) |
| `supabase/` | SQL |
| `tests/run.js` | 자체 테스트 (jsdom 화면 테스트 + API 테스트), `npm test` |
| `preview/` | 데모 만들기 (`build-demo.py`, `mock-api.js`, 선택 `sample.jpg`) — 배포와 무관 |
| `vercel.json` | 리전 icn1, 보안 헤더, **매일 09:00 KST `/api/ping` 예약 작업(cron `0 0 * * *` UTC)** |

Vercel Hobby는 함수 12개 제한 → 지금은 1개. 새 API는 `routes/`에 파일 추가 + `api/[route].js`의 목록에 한 줄 추가.

화면 라우트: `#/`홈, `#/ranking`, `#/osul`오술, `#/osul/manage`(운영자), `#/tasting`(탭 이름은 "사케"), `#/my`, `#/admin`, `#/admin/guests`·`#/admin/requests`·`#/admin/backup`(운영자), `#/request`(손님 사케 요청), `#/sake/:id`, `#/sake/:id/rate`, `#/sake/:id/rate/:리뷰번호`.
하단 메뉴: **홈 · 랭킹 · 오술 · 사케 · MY** (평가 화면에서는 숨김).

## 6. 확정된 기획·규칙 (바꾸려면 사용자 확인)

- **입장 화면**(2026-11-26): 로그인 칸 하나(닉네임+비밀번호). **아이디가 정확히 `ADMIN`이면 운영자 로그인**(따로 운영자 로그인 화면·탭 없음). 로그인 버튼 아래 "회원가입" 버튼 → 회원가입 화면("이미 가입했어요 · 로그인"으로 돌아감). 서버는 예전 `action:'admin'` 방식도 계속 받는다.
- **가입**: 닉네임(한글 가능)+비밀번호. IP 중복 가입 허용. 운영자만 사케 등록·수정·삭제, 운영자도 평가 가능.
- **사케 정보**: 이미지(흰 배경 정사각형 권장, 업로드 시 최대 1000px로 줄임, 없으면 색 병 그림), 이름, 원료, 정미율, 도수, 주도, 산도(주도·산도 비워도 됨), 주조사, 원산지, 술 설명 제목(40자)·본문(1000자, 여러 줄). 상세의 양조장·원산지는 파란 밑줄 링크 → 모아보기.
- **평가**: 단맛·산미·바디감·알콜감·여운 1~5 (오각형) + 한줄평 50자 + **만족도 별점 0.5~5(반 개 단위, 필수)** + 마신 날짜(미래 불가, 요일 표시).
- **리뷰 여러 번**(2026-11-26): 같은 사케를 다시 마시면 "다시 마셨어요"으로 리뷰를 하나 더 남긴다. 상세의 "내 기록"에서 하나씩 수정·삭제(삭제는 두 단계).
  - 리뷰 날짜는 **처음 쓴 시각**(created_at). 고쳐도 그대로. **"수정됨" 표시는 하지 않는다**(사용자 결정). 홈 친구 소식도 처음 쓴 시각 기준(고치기만 하면 다시 안 뜸).
  - **평균·랭킹·비슷한 친구 = 사람당 1표, 그 사람의 가장 최근 리뷰**(마신 날짜 → 쓴 시각 순). 기간 랭킹은 그 기간 안에서 가장 최근 것. "N명"은 사람 수.
  - **레벨 = 리뷰 수.** 한줄평·별점·주말·월간·연속 뱃지도 리뷰 수. 양조장·원산지·정미율·주도·개척자·같은 날 3병 뱃지는 **서로 다른 사케**로 센다.
  - API: `POST /api/rate` (id 없으면 새 리뷰, `id` 있으면 내 그 리뷰 고치기), `DELETE /api/rate?id=` (내 리뷰만). 주소 `#/sake/:id/rate`=새 기록, `#/sake/:id/rate/:리뷰번호`=고치기.
  - 내 리뷰를 모두 지우면 다시 블라인드(평가 전 상태).
- 서버는 평가를 1000줄씩 나눠 받는다(`store.selectAll`) — Supabase 한 번 최대 1000줄 제한 때문.
- **추가 기능**(2026-11-26, 음식 페어링은 사용자가 뺌):
  - **마신 온도**: 평가 때 차갑게·상온·따뜻하게·뜨겁게 중 하나(선택, 다시 누르면 풀림). 내 기록·리뷰·MY·CSV에 표시.
  - **내 맛 변화**: 같은 사케 기록이 2개 이상이면 상세에 최근 4개 오각형을 겹쳐 보여줌(최근 = 보라, 예전 = 주황·초록·회색 점선).
  - **홈 "오늘의 오술"**: 레벨 카드 바로 아래, 오늘 오술이 있을 때만. 순서 번호·"N병 중 M병 기록".
  - **로그인 잠금**: 같은 계정 5번 틀리면 10분 잠금(429). 운영자(ADMIN)도 적용. 성공하면 횟수 초기화. 화면의 4자 검사는 **가입 때만**(운영자 비번 길이와 무관하게).
  - **운영자 손님 관리**: 비밀번호 초기화 → 6자리 임시 비밀번호를 한 번만 보여줌(헷갈리는 0·o·1·l·i 제외), 잠금도 풀림.
  - **데이터 백업**: 운영자 MY → 리뷰 전체 CSV, 사케 목록 CSV, 원본 JSON. 비밀번호(해시) 제외. 안드로이드 앱에선 `SKAPP.saveText`로 저장.
  - **사케 요청**: 손님 MY·사케 목록 아래 → 요청(이름 80자, 메모 200자, 처리 안 된 요청 1인 20개까지). 운영자는 모아 보고 "처리 완료"·삭제. 손님은 자기 것만 보고 지움.
  - **홈 화면에 추가**(안드로이드·아이폰, 2026-11-26): MY 맨 위(레벨 카드 아래) 보라색 버튼 "홈 화면에 추가". 안드로이드 크롬은 설치 창(beforeinstallprompt)을 바로 띄우고, 안 되면 방법 안내. 아이폰은 "공유 → 홈 화면에 추가" 안내. 이미 홈 화면 앱·APK 안·PC면 안 보임. `manifest.json`(아이콘 192·512), `icon-180.png`(아이폰), `sw.js`(설치 조건용, 캐시 안 함).
  - MY의 손님 요청 버튼 이름은 **"마셔보고 싶은 사케 요청하기"**, "홈 화면에 추가"와 같은 보라색 중요 버튼(`.ctabtn`).
  - **MY 목록 5개씩**: "내가 쓴 리뷰"·"마셔보고 싶어요"는 5개씩, `‹ 1 2 3 ›` 페이지 버튼. 정렬 바꾸면 1페이지. 엑셀 저장은 전부.
- 답변에 테스트 개수(N개 통과)는 적지 않는다(사용자 요청). 테스트 실행은 계속.
- **블라인드 규칙**: 내 평가를 저장해야 평균(오각형 비교)과 남의 리뷰가 보인다. 홈의 친구 소식에는 별점·한줄평을 안 보여준다. 리뷰 목록: 닉네임(옆에 별점), 날짜·시간, 한줄평.
- 오각형 맛 기록은 "점수"가 아니라 맛 기록 → **취향 추천·입맛 프로필에 쓰지 않는다.**
- **랭킹**: 만족도 별점 평균, 평가 여부와 상관없이 공개, 기간 기준은 마신 날짜, 기본 "전체", 월간·주간(월~일)·일간. 별점 없는 평가는 제외.
- **홈**: 내 레벨 카드, 할 일(평가할 사케), 새로 들어온 사케(14일 이내 NEW), 테이스팅 랭킹 TOP 3(전체 기간), 친구들의 최근 시음. 섹션 사이 여백+구분선.
- **MY**: 닉네임·비번 변경, 탈퇴(리뷰·찜 모두 삭제), 내 리뷰, 찜, 올해 리포트, CSV 내보내기, 레벨·뱃지, **"나와 입맛이 비슷한 친구" = 함께 별점 준 사케 2병 이상, 별점 차이로 일치도%**. 운영자 MY에는 "운영자 메뉴"와 "오술 관리".
- **레벨**(평가 수): 1 쌀(0) · 2 누룩(3) · 3 보통주(6) · 4 혼죠조(10) · 5 긴죠(15) · 6 다이긴죠(25) · 7 준마이다이긴죠(40) · 8 토우지(60).
- **뱃지 15개**, 기준이 애매하지 않은 것만, 모두 다른 그림: first, comment10, brewer5, origin5, regular3, polish5, dry3, sweet3, pioneer3, session3, weekend5, weekly4, month10, perfect, critic3.
- **오술(오늘 마실 술)**: 운영자가 MY → 오술 관리에서 날짜별로 사케를 고르고 순서를 정해 저장(하루 30병까지). 오술 탭에서 모두가 그날 목록을 순서대로 본다. **미래 날짜도 손님에게 공개**(사용자 요청). ‹ › 로 다른 날 오술 이동. 오술에서 들어간 상세는 "← 오술", 이전/다음 술도 오술 순서. 지난 오술에서 처음 평가하면 마신 날짜 기본값 = 그 오술 날짜. 아이콘은 달력+술방울(커피잔 모양 금지).
- **디자인**: 고딕 단일 서체(Inter + Noto Sans KR), 리니어 스타일, 보라 계열(`--me:#5230f5`), 폰 폭 460px 단일 컬럼, 다크모드 지원.
- 평가 화면의 맛 항목(단맛·산미·바디감·알콜감·여운)은 **1~5 숫자 버튼**. 슬라이드 막대(range)는 폰에서 스크롤하다 잘못 바뀌어서 쓰지 않는다(사용자 요청, 2026-11-26).
- 날짜 칸(`.datebox`)은 투명 input의 달력 버튼을 칸 전체로 넓혀서 어디를 눌러도 달력이 열린다.

## 7. 속도 관련 (왜 이렇게 만들었나)

- 탭마다 따로였던 서버 함수 9개 → 1개(`api/[route].js`): 콜드 스타트가 탭마다 0.5~0.75초씩 → 한 번만.
- supabase-js·jsonwebtoken 제거(콜드 스타트 단축). 기존 로그인 쿠키와 호환.
- 화면: 마지막 화면을 localStorage(`sk-cache-v1`)에 기억해 바로 보여주고 뒤에서 새로 고침. 첫 화면 후 다른 탭 데이터 미리 받기. 본 상세는 메모리 캐시(+이전/다음 술 미리 받기). 로그아웃·다른 계정이면 캐시 삭제.
- 글꼴은 렌더를 막지 않게 preload 방식.

## 8. 운영 메모

- **Supabase 무료 플랜은 7일간 사용이 없으면 일시정지**된다 (2026-11-05에 실제로 멈춤 → 대시보드에서 Resume project로 복구).
  → 그래서 `vercel.json`에 매일 09:00(KST) `/api/ping` 예약 작업을 넣었다. ping은 DB를 가볍게 한 번 조회한다.
  → 그래도 사이트가 "서버에 문제" 오류를 보이면 Supabase 대시보드에서 일시정지 여부부터 확인.
- 게스트가 비밀번호를 잊으면: Supabase Table Editor → `guests`에서 그 줄 삭제 → 같은 닉네임으로 재가입(평가는 닉네임으로 이어짐).
- 운영자 비밀번호 변경: Vercel → Settings → Environment Variables → `ADMIN_PASSWORD` 수정 → Redeploy.
- ⚠️ README.md의 `SESSION_SECRET` 예시값이 저장소에 적혀 있다. 실제로 그 값을 쓰고 있다면 Vercel에서 새 긴 문자열로 바꾸는 것을 권장(바꾸면 모두 한 번 다시 로그인). 사용자에게 확인 후 진행.

## 9. 안드로이드 앱 (APK)

- 사이트를 그대로 여는 WebView 앱(패키지 `com.saketbook.app`, 최소 Android 8). 웹을 배포하면 앱도 자동으로 최신 → **웹 수정 때 APK 다시 만들 필요 없음.**
- 앱 소스와 서명 키는 사용자가 받은 `sake-t-book-app-source.zip`(이 폴더의 `android-app/`에 두면 좋다). 앱을 업데이트하려면 **같은 서명 키(sign/sake-t-book.keystore)** 로 서명해야 기존 앱 위에 설치된다.
- 앱 기능: 로그인 유지(쿠키), 뒤로가기=웹 뒤로, 사진 고르기, CSV를 다운로드 폴더에 저장(JS 브리지 `SKAPP.saveText`), 다크모드, 오프라인 안내.
- 빌드는 Android build-tools(aapt2, d8, apksigner)와 android.jar(API 34)가 필요. `build.sh` 참고.

## 10. 테스트·데모 실행 (이 컴퓨터에서)

```bash
npm install          # 처음 한 번 (jsdom)
npm test             # 180개 이상 모두 통과해야 함
python preview/build-demo.py   # → preview/demo.html 을 브라우저로 열기
```
- 데모 계정: 게스트 `예시손님 / 1234`, 운영자는 같은 로그인 칸에 `ADMIN / 아무 비밀번호`.
- 테스트는 시간대를 `Asia/Seoul`로 고정한다(`tests/run.js` 맨 위).

## 11. 지금까지의 흐름 (요약)

1. 기본 사이트(가입·운영자 등록·평가·오각형·블라인드) → Vercel 배포
2. 사케 수정, 마신 날짜·검색·필터·캘린더, 술 설명, 링크, 별점(반 개), 이전/다음 술
3. 하단 메뉴(홈/랭킹/테이스팅/MY), 레벨·뱃지, 찜, 비슷한 친구, 운영자 인증 마크
4. 홈 섹션 여백, 안드로이드 APK
5. 속도 개선(함수 1개, 가벼운 DB 연결, 캐시·미리 받기)
6. 오술 메뉴 추가, "테이스팅" → "사케", 날짜 칸 달력 개선
7. Supabase 일시정지 복구 + 매일 깨우기 예약 작업
8. 로컬 Claude Code 이어서 작업용으로 CLAUDE.md·preview 정리 (이 파일)
9. 점검 + 개선 계획(`docs/improvement-plan.md`), 리뷰 여러 번·처음 쓴 날짜 유지·1000줄 나눠 받기 (update-7), 로그인 통합(ADMIN)·회원가입 버튼
10. 마신 온도·내 맛 변화·홈 오늘의 오술·로그인 잠금·비번 초기화·백업·사케 요청·아이폰 홈 화면 (update-8) — 2026-11-26 배포 완료
11. 홈 화면에 추가(안드로이드·아이폰) 버튼, MY 리뷰·찜 5개씩 페이지, 요청 버튼 이름·색 — 2026-11-26
