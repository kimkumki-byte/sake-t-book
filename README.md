# 사케치북 배포 안내

기억력 한계를 극복하기 위한 사케 기록장. 아래 순서대로 한 번만 하면 돼요. (모두 무료)

준비물: GitHub, Supabase, Vercel 계정 (Vercel은 GitHub 계정으로 가입하면 편해요)

---

## 1단계. GitHub에 파일 올리기 (5분)

1. github.com 로그인 → 오른쪽 위 **+** → **New repository**
2. 이름: `sake-t-book` → **Private** 선택 → **Create repository**
3. 화면의 **uploading an existing file** 링크 클릭
4. 받은 zip을 푼 폴더 **안의 내용물 전체**(api, lib, public, supabase 폴더와 파일들)를 끌어다 놓기
5. 아래 **Commit changes** 클릭

## 2단계. Supabase에 데이터베이스 만들기 (5분)

1. supabase.com 로그인 → **New project**
2. 이름 `sake-t-book`, 데이터베이스 비밀번호는 아무거나(따로 쓸 일 없음), Region은 **Northeast Asia (Seoul)** → 만들기 (1~2분 기다림)
3. 왼쪽 메뉴 **SQL Editor** → `supabase/schema.sql` 파일 내용을 통째로 복사해서 붙여넣기 → **Run**
   - "Success. No rows returned" 가 나오면 성공
4. 두 가지 값을 복사해 메모장에 적어 두기
   - **Project URL**: 프로젝트 첫 화면의 **Connect** 버튼, 또는 Project Settings → **Data API** 에 있는 `https://....supabase.co` 주소
   - **Secret key**: Project Settings → **API Keys** → Secret keys 의 `sb_secret_...` 값 (없으면 새로 만들기)
   - ⚠️ Secret key는 절대 다른 사람에게 보내거나 화면 코드에 넣지 마세요.

## 3단계. Vercel로 배포하기 (5분)

1. vercel.com 로그인 → **Add New… → Project**
2. GitHub의 `sake-t-book` 저장소 옆 **Import**
3. **Framework Preset** 은 **Other** 그대로
4. **Environment Variables** 를 펼쳐 아래 4개를 하나씩 추가

| Key | Value |
|---|---|
| `SUPABASE_URL` | 2단계에서 복사한 Project URL |
| `SUPABASE_SECRET_KEY` | 2단계에서 복사한 `sb_secret_...` |
| `SESSION_SECRET` | `mKixbZ2H3hWeOND03pVD-qyVAn2vieEk` (이 값 그대로 써도 되고, 아무 긴 문자열로 바꿔도 돼요) |
| `ADMIN_PASSWORD` | 운영자 비밀번호 |

5. **Deploy** → 1분 정도 뒤 축하 화면이 나오면 완료. 나온 주소(`https://sake-t-book-....vercel.app`)가 사이트 주소예요.

## 4단계. 확인하기

1. 사이트 주소 접속 → 아래 **운영자 로그인** → 아이디 `ADMIN` / 3단계에서 넣은 비밀번호
2. 사케 하나 등록 → **시음하기** 로 가서 평가해 보기
3. 지인들에게 사이트 주소를 보내면 끝. 지인은 **처음이에요** 탭에서 닉네임과 비밀번호로 가입해요.

---

## 수정사항 반영하기 (업데이트)

1. 받은 업데이트 zip을 풀면 `api`, `lib`, `public`, `supabase` 같은 폴더가 나와요.
2. GitHub 저장소 첫 화면 → **Add file → Upload files**
3. 풀린 폴더들을 **폴더째** 끌어다 놓기 → **Commit changes**
   - 같은 이름의 파일은 새 파일로 바뀌고, 나머지 파일은 그대로 남아요.
4. 1분 정도 뒤 Vercel이 자동으로 새로 배포해요. 사이트를 새로고침해서 확인하면 끝.
5. 업데이트에 `supabase/update-...sql` 파일이 들어 있으면, 코드 올리기 **전에** Supabase → SQL Editor 에서 한 번 실행해요.

## 알아 두면 좋은 것

- **운영자 비밀번호 바꾸기**: Vercel → 프로젝트 → Settings → Environment Variables 에서 `ADMIN_PASSWORD` 수정 → Deployments 탭에서 최신 배포의 **⋯ → Redeploy**
- **Supabase 무료 플랜은 일주일 동안 아무도 접속하지 않으면 잠들어요.** 사이트가 오류를 보이면 Supabase 대시보드에서 **Restore project** 를 누르면 다시 깨어나요. 데이터는 그대로예요.
- **게스트가 비밀번호를 잊으면**: Supabase → Table Editor → `guests` 표에서 그 닉네임 줄을 지우면 같은 닉네임으로 다시 가입할 수 있어요. (평가 기록은 닉네임으로 이어지므로 그대로 남아요)
- **사진**: 정사각형·흰 배경 사진을 권장해요. 올릴 때 자동으로 최대 1000px로 줄여서 저장해요.
- **화면 수정 후 다시 배포**: GitHub 저장소에 바뀐 파일을 다시 올리면 Vercel이 자동으로 새로 배포해요.

## 폴더 구성 (참고)

| 폴더/파일 | 하는 일 |
|---|---|
| `public/` | 화면 (index.html, app.js, style.css, logo.png) |
| `api/` | 서버: 로그인, 사케 목록·등록·수정·삭제, 평가 저장 |
| `lib/` | 서버 공통 도우미 (로그인 확인, 입력값 검사, 데이터베이스 연결) |
| `supabase/schema.sql` | 데이터베이스 만드는 SQL (2단계에서 한 번만 실행) |
| `vercel.json` | Vercel 설정 |
| `tests/` | 자체 테스트 (`npm test`) — 배포에는 포함 안 됨 |
