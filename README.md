# LikeMEME

**AI가 참가자들의 밈 따라하기 사진을 판정하는 2~4인 실시간 5라운드 웹 게임입니다.**

## 프로젝트 소개

밈을 보고 따라 하는 놀이는 쉽고 직관적이지만, 여러 사람이 함께할 때 결과를 일관되게 비교하고 즉시 승자를 정하기는 어렵습니다. LikeMEME는 모든 참가자에게 같은 reference meme과 촬영 시각을 제공하고, AI가 각 사진의 표정·포즈·스타일 유사도를 동일한 기준으로 평가합니다.

사용자는 별도 계정 없이 방 코드나 초대 링크로 참여합니다. 카메라 앞에서 밈을 따라 하면 countdown 종료 시 사진이 자동 촬영되고, 모든 참가자의 제출이 끝난 뒤 AI 판정 결과와 라운드 승자가 모든 화면에 동기화됩니다.

## 핵심 게임 플로우

1. 호스트가 6자리 코드의 방을 생성합니다.
2. 2~4명의 플레이어가 방 코드 또는 초대 링크로 접속하고 고유한 닉네임을 입력합니다.
3. 모든 플레이어가 카메라 권한을 허용하고 READY 상태가 됩니다.
4. 호스트가 게임을 시작하면 DB가 활성 meme pool에서 서로 다른 meme 5개를 선택합니다.
5. 각 라운드에서 모든 플레이어가 같은 reference meme을 3초 동안 관찰합니다.
6. 5초 countdown 후 각 기기에서 사진을 자동 촬영합니다.
7. 사진을 private Supabase Storage에 직접 업로드하고 submission을 DB에 기록합니다.
8. 모든 라운드 참가자의 제출이 완료되면 서버가 Gemini 판정을 한 번만 시작합니다.
9. Expression, Pose, Style 점수와 종합 싱크로율, 라운드 winner를 표시합니다.
10. 결과 상태를 거친 뒤 다음 라운드가 자동 시작됩니다.
11. Round 5 종료 후 누적 결과를 계산해 Final Result를 표시합니다.

## AI의 역할

AI는 각 라운드의 reference meme과 모든 참가자의 사진을 한 요청에서 비교합니다. 플레이어 닉네임, 이전 점수, 누적 승수는 모델에 전달하지 않으며 참가자 이미지 순서는 매 라운드 무작위로 섞습니다.

현재 judging 모델은 `gemini-3.5-flash-lite`입니다. Gemini 응답은 structured output schema와 Zod validation을 모두 통과해야 하며, 서버가 검증된 정수 점수만 DB에 저장합니다. AI는 설명문, 총점, 순위 또는 winner를 결정하지 않습니다. 총점과 winner는 PostgreSQL 함수가 authoritative하게 계산합니다.

### 판정 기준

각 항목은 **0~10 정수**입니다.

- **Expression:** 눈, 눈썹, 입 모양, 감정 강도, 얼굴 방향
- **Pose:** 몸 방향, 팔·다리·손의 위치, 기울기, 실루엣, 화면 내 배치
- **Style:** 헤어스타일과 색상, 의상 유형·색·패턴, 액세서리, 소품

카테고리 싱크로율은 `점수 × 10%`, 종합 싱크로율은 `(Expression + Pose + Style) / 30 × 100`을 반올림해 표시합니다. 승자 판정에는 반올림된 비율이 아니라 30점 만점의 raw total을 사용합니다.

동점일 때는 다음 순서로 비교합니다.

1. 해당 meme의 key category 점수
2. 세 카테고리 중 최저 점수
3. 세 카테고리 중 두 번째로 낮은 점수
4. 끝까지 같으면 공동 라운드 winner

공동 winner는 각각 1승을 받습니다.

## 5-round 진행 구조

게임 시작 시 DB가 5개의 서로 다른 meme과 각 라운드 참가자를 확정합니다. Round 1만 `scheduled` 상태와 공유 `starts_at`을 받고, 나머지는 `pending`으로 생성됩니다.

```text
pending
  ↓ 이전 라운드 결과 유지 시간 종료
scheduled (공유 starts_at)
  ↓ 모든 참가자 submission 완료
judging
  ├─ 성공 → complete → 결과 공개 → 다음 round
  └─ 실패 → retry 1회 → invalid → 다음 round

Round 5 complete/invalid
  ↓
room finished + final_results
```

클라이언트가 Realtime 이벤트를 받은 시각이 아니라 DB의 `starts_at`을 기준으로 3초 관찰과 5초 countdown을 계산합니다. 정상 판정 결과는 category reveal을 포함해 DB 기준 약 8초 동안 유지되고, invalid 결과는 약 5초 유지됩니다. 다음 라운드는 `advance_game()`이 room row를 잠근 상태에서 한 번만 활성화합니다.

Final Result는 다음 순서로 competition ranking을 계산합니다.

1. 누적 라운드 승수
2. 유효 라운드 누적 raw total
3. 2위 횟수
4. 가장 낮은 단일 라운드 total
5. 가장 높은 단일 라운드 total
6. 모두 같으면 공동 순위

Invalid round는 승수와 누적 점수, 2위 횟수, worst/best 계산에서 제외됩니다.

## 멀티플레이와 Realtime

Supabase Database가 room, player, round, submission, score 및 final result의 source of truth입니다. Supabase Realtime은 상태 변경 알림으로만 사용하며, 알림을 받은 클라이언트는 `get_room_snapshot()` RPC로 현재 DB snapshot을 다시 읽습니다.

클라이언트는 다음 상황에서도 snapshot을 다시 조회합니다.

- Realtime channel 구독 완료 및 관련 table 변경
- 브라우저가 background에서 foreground로 복귀
- 네트워크가 offline에서 online으로 복구
- 주요 API 동작 완료

동시에 여러 snapshot 요청이 발생하면 가장 최근 요청만 React state에 반영합니다. 브라우저에는 anonymous Supabase session과 마지막 room code가 저장되므로 같은 세션에서 새로고침한 경우 현재 방과 라운드 상태를 복구할 수 있습니다.

## AI 실패와 stale judging 복구

- Gemini 호출은 시도당 최대 20초입니다.
- SDK 내부 retry는 중첩하지 않고 애플리케이션에서 한 번만 재시도합니다.
- 두 번 모두 실패하거나 timeout이면 해당 라운드를 `invalid` 처리합니다.
- judging route는 48초의 내부 work budget과 단계별 timeout을 사용하고 Vercel function의 `maxDuration = 60`보다 먼저 종료하도록 구성했습니다.
- reference load, Storage download, 각 Gemini attempt, complete/invalidate 단계의 소요 시간을 민감정보 없이 Vercel log에 남깁니다.
- Vercel hard termination 등으로 `judging` 상태가 남으면 클라이언트가 recovery API를 확인합니다.
- `judging_started_at` 이후 65초 이상 지난 stale round만 서버 RPC가 `invalid`로 전환합니다.
- Invalid round도 게임을 중단하지 않고 다음 라운드 또는 Final Result로 진행합니다.

## 기술 스택

| 영역 | 기술 | 역할 |
|---|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS | 온보딩, 방/대기실, 카메라, 라운드, 결과 UI |
| Camera | MediaDevices, MediaStream, Canvas, Blob | 권한 확인, 공유 시각 기반 자동 촬영, JPEG Blob 생성 |
| Backend | Next.js Route Handlers, Node.js runtime | JWT 검증, judging/advance/stale recovery orchestration |
| Database | Supabase PostgreSQL | authoritative game state, atomic RPC, scoring/ranking 계산 |
| Realtime | Supabase Realtime | DB 변경 알림 후 snapshot 갱신 |
| Auth | Supabase Anonymous Auth | 계정 생성 없이 플레이어 session 식별 |
| Storage | Supabase Storage | 참가자 사진의 private direct upload 및 server-side download |
| AI | Gemini Vision via `@google/genai` | reference와 참가자 사진의 3개 category scoring |
| Validation | Gemini JSON schema, Zod | AI structured output 및 participant/score 검증 |
| Deployment | Vercel | Next.js frontend와 Node.js API Route 배포 |
| Audio | Browser Audio API | 첫 사용자 interaction 이후 단일 BGM loop와 ON/OFF 제어 |

## 구성요소별 책임

### Frontend

- anonymous session 생성 및 유지
- 방 생성·입장, 닉네임, READY, host start 연결
- shared `starts_at` 기반 카메라 observation/countdown/capture
- 촬영 Blob 유지 및 Storage direct upload
- Realtime/foreground/online 이벤트 후 DB snapshot 복구
- 결과 reveal, 자동 round advance 요청, Final Result 표시
- 첫 사용자 interaction 이후 BGM 재생 및 toggle

### Backend / Database

- 방 정원 2~4명, 고유 닉네임, host-only start 검증
- 게임 시작 후 신규 입장 차단
- 5개 meme 선택과 round/player snapshot 생성
- submission path와 참가자 소유권 검증
- round별 atomic judging claim
- authoritative score 저장, tie rule, round winner, final ranking 계산
- `result_ends_at` 검증과 idempotent next-round 전환

### AI

- reference image와 해당 round의 전체 참가자 사진을 한 번에 평가
- Expression/Pose/Style 각각 0~10 정수 반환
- 참가자 순서 무작위화와 동일 평가 기준 적용
- 정해진 JSON 이외의 설명이나 ranking을 생성하지 않음

### Storage

Supabase의 private `round-submissions` bucket을 사용합니다. object path는 다음 형식입니다.

```text
{room_id}/{round_number}/{player_id}.jpg
```

브라우저는 자신의 scheduled round 경로에만 insert할 수 있습니다. 업로드가 실패하면 성공한 촬영 Blob을 유지하고 같은 사진을 재업로드하며, upload 실패를 이유로 새 사진을 촬영하지 않습니다. Judging route는 server-side service role로 private object를 다운로드합니다.

## 주요 보안 설계

- 브라우저에는 Supabase URL과 publishable key만 제공합니다.
- `GEMINI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 `server-only` 모듈과 Node.js API Route에서만 사용합니다.
- judging, advance, stale recovery API는 Bearer token을 받고 Supabase `auth.getUser()`로 검증한 UID만 RPC에 전달합니다.
- 클라이언트가 전달한 user ID를 신뢰하지 않습니다.
- privileged judging/advance/recovery RPC는 `service_role`만 실행할 수 있습니다.
- 일반 클라이언트 RPC도 `auth.uid()`, room membership, host, room/round status를 DB에서 검증합니다.
- RLS는 room member에게 필요한 snapshot만 읽도록 제한합니다.
- Storage bucket은 private이며 public URL을 생성하지 않습니다.
- Storage policy는 room, round, player가 일치하는 본인 사진만 scheduled 상태에서 upload하도록 제한합니다.
- `(round_id, player_id)` submission unique constraint와 atomic `claim_round_judging()`으로 중복 제출·중복 판정을 방지합니다.
- 점수와 winner는 클라이언트가 쓰지 않고 service-role RPC가 검증 후 저장합니다.

## 로컬 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. Supabase 준비

Supabase 프로젝트에서 Anonymous Sign-In을 활성화하고 `supabase/migrations/`의 migration을 파일명 순서대로 적용합니다. Migration은 테이블, RLS, RPC, Realtime publication, private Storage bucket/policy와 개발용 meme pool을 구성합니다.

이미 운영 중인 프로젝트에는 적용 완료 migration을 다시 실행하지 마세요.

### 3. 환경변수 설정

프로젝트 루트의 로컬 환경 파일에 다음 이름을 설정합니다. 실제 값은 저장소에 commit하지 않습니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

| 이름 | 노출 범위 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | anonymous auth, Realtime, RPC, direct upload |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | privileged judging/advance/recovery와 private download |
| `GEMINI_API_KEY` | Server only | Gemini Vision scoring |

### 4. 개발 서버 실행

```bash
npm run dev
```

Desktop 브라우저에서는 `http://localhost:3000`으로 접속합니다. 실제 iPhone Safari 카메라 테스트에는 브라우저가 신뢰하는 HTTPS 주소가 필요하므로 Production/Preview HTTPS 배포 사용을 권장합니다.

로컬 앱도 설정된 실제 Supabase와 Gemini를 사용합니다. 테스트 방과 AI 요청이 해당 프로젝트에 기록되고 외부 API 사용량이 발생할 수 있습니다.

### 5. 정적 검증과 Production build

```bash
npm run lint
npx tsc --noEmit
npm run build
```

최종 실기기 검증 절차는 [`docs/FINAL_QA_CHECKLIST.md`](docs/FINAL_QA_CHECKLIST.md)를 참고합니다.

## Production 배포 구조

```text
Mac Chrome / iPhone Safari
  ├─ Next.js UI on Vercel
  ├─ Supabase Anonymous Auth
  ├─ Supabase RPC + Realtime snapshot recovery
  └─ private Storage direct upload

Vercel Node.js API Routes
  ├─ JWT verification
  ├─ atomic judging / advance / stale recovery RPC
  ├─ private Storage download using service role
  └─ Gemini Vision request

Supabase PostgreSQL
  └─ game state, score, winner, progression, final ranking
```

Vercel Production 환경에도 로컬과 동일한 4개 환경변수 이름이 필요합니다. service role key와 Gemini key에는 `NEXT_PUBLIC_` prefix를 붙이지 않습니다. Judging API는 Node.js runtime과 60초 `maxDuration`을 사용합니다.

## 프로젝트 구조

```text
app/
  api/rounds/[roundId]/   # judge, advance, stale recovery Route Handlers
  globals.css             # 현재 온보딩 및 게임 UI 스타일
  layout.tsx              # LikeMEME metadata와 root layout
  page.tsx                # 게임 UI와 BGM controller 조합
components/
  audio/                  # BGM lifecycle 및 ON/OFF toggle
  camera/                 # camera permission, shared timer, capture Blob
  multiplayer/            # 방 입장부터 Final Result까지의 client game flow
lib/
  supabase/               # browser/service clients와 snapshot types
  vision/                 # Gemini scorer, retry, schema/Zod validation
public/
  audio/                   # BGM asset
  brand/                   # LikeMEME logo 및 onboarding asset
  reference-memes/         # 현재 개발용 reference meme 5개
supabase/migrations/       # schema, RLS, RPC, Storage, 5-round/recovery 변경 이력
docs/
  FUNCTIONAL_SPEC.md       # 제품 규칙의 source of truth
  FINAL_QA_CHECKLIST.md    # Production 실기기 QA matrix
```

## 현재 구현 범위와 인수인계 참고

현재 구현은 2~4명이 방에 참여해 5라운드를 완료하고 Final Result를 확인하는 Happy Path, AI invalid 처리, stale judging recovery, Realtime/snapshot 복구까지 포함합니다.

다음 항목은 기능명세에 언급되어 있지만 현재 코드에는 완성된 기능으로 구현되어 있지 않습니다.

- disconnect grace period 이후 플레이어 제외 및 1명 잔존 시 게임 종료
- Final Result에서 메인 화면으로 돌아가는 동작
- 게임 종료 또는 abandoned room의 참가자 사진 cleanup
- 온보딩 `?` 버튼의 도움말 modal
- 최종 meme 콘텐츠 및 전체 화면의 최종 디자인 polish

현재 private Storage의 사진은 자동 cleanup되지 않으므로 운영 기간이 길어질 경우 별도 관리가 필요합니다. 이 README는 현재 해커톤 제출 구현을 기준으로 하며, 위 항목을 구현된 기능으로 간주하지 않습니다.
