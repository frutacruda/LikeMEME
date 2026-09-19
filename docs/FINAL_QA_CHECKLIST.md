# LikeMEME 최종 Production QA 체크리스트

Production URL과 실제 Supabase/Gemini 환경을 사용하는 최종 제출 전 수동 QA 문서다. 기능을 확인하기 위해 Production 코드나 DB 데이터를 변경하지 않는다.

## 실행 원칙

- 결과 기록: 각 케이스 제목의 `[ ]`를 통과 시 `[x]`로 바꾸고, 실패 시 기기·브라우저·시각·방 코드·라운드를 함께 기록한다.
- P0 실패: 이후 테스트를 중단하고 제출 전에 수정 여부를 결정한다.
- P1 실패: 핵심 플로우가 계속되더라도 재현 조건과 화면 녹화를 남긴다.
- 시간 판정은 기기 간 완전한 프레임 일치가 아니라, DB의 공유 시각을 기준으로 두 화면이 같은 단계와 자동 촬영으로 진행하는지를 본다.
- AI failure/invalid 및 stale judging은 외부 장애가 자연 발생했을 때만 검증한다. 이를 만들기 위해 Production 코드, 환경변수, migration 또는 DB 상태를 변경하지 않는다.
- 자동 검증 구분:
  - `사람`: 화면·카메라·오디오 등 실기기 확인이 필수다.
  - `부분 자동`: DB 제약/RPC/코드가 핵심 규칙을 강제하지만 최종 사용자 동작은 사람이 확인한다.
  - `자동 가능`: read-only DB 조회나 브라우저 자동화로 판정할 수 있으며 실기기 확인은 보조다.

---

## 1. Room / Entry

### [ ] ROOM-01 — 방 생성과 정상 코드 입장

- **Priority:** P0
- **Preconditions:** Production URL 접속 가능, 서로 다른 브라우저 세션 2개
- **Test steps:**
  1. 기기 A에서 온보딩을 시작하고 `새 방 만들기`를 누른다.
  2. 6자리 방 코드가 표시되는지 확인하고 닉네임 `HostQA`로 입장한다.
  3. 기기 B에서 `코드로 입장하기`를 열어 같은 코드를 입력한다.
  4. 닉네임 `GuestQA`로 입장한다.
- **Expected result:** 두 기기가 같은 대기실로 들어가며 코드가 일치한다. 플레이어 수는 `2/4`이고 각 닉네임은 한 번씩 표시된다.
- **필요한 기기/인원:** 2개 브라우저 세션 / 2명 또는 1명이 두 기기 사용
- **검증 방식:** 부분 자동 + 사람

### [ ] ROOM-02 — 잘못된/존재하지 않는 방 코드

- **Priority:** P0
- **Preconditions:** Main Menu 상태
- **Test steps:**
  1. 5자리 코드를 입력하고 입장을 시도한다.
  2. 이후 실제 존재하지 않는 6자리 코드를 입력해 닉네임 화면에서 입장을 시도한다.
- **Expected result:** 5자리는 `6자리 방 코드` 안내로 차단된다. 존재하지 않는 6자리 방은 입장되지 않고 오류가 표시되며 빈 대기실이 생성되지 않는다.
- **필요한 기기/인원:** 1대 / 1명
- **검증 방식:** 부분 자동 + 사람

### [ ] ROOM-03 — 중복 닉네임 차단

- **Priority:** P1
- **Preconditions:** 플레이어 1명이 `SameName`으로 입장한 대기실
- **Test steps:** 다른 세션에서 같은 방 코드와 대소문자만 다르거나 동일한 `SameName` 닉네임으로 입장한다.
- **Expected result:** 두 번째 입장이 거절되고 기존 플레이어 목록은 변하지 않는다.
- **필요한 기기/인원:** 2개 세션 / 1명 가능
- **검증 방식:** 자동 가능(DB unique index) + 사람

### [ ] ROOM-04 — 게임 시작 후 신규 입장 차단

- **Priority:** P0
- **Preconditions:** 2명 이상이 시작해 Round 1 이상 진행 중인 방, 별도 신규 브라우저 세션
- **Test steps:** 신규 세션에서 진행 중인 방 코드로 닉네임을 제출한다.
- **Expected result:** `Game already started` 계열 오류로 입장이 거절된다. 진행 중 플레이어 수와 게임 상태는 변하지 않는다.
- **필요한 기기/인원:** 기존 게임 2명 + 신규 세션 1개
- **검증 방식:** 자동 가능(RPC 상태 검증) + 사람

## 2. Waiting Room

### [ ] WAIT-01 — 참가자 목록, 좌석 색상, 호스트 표시 Realtime 동기화

- **Priority:** P0
- **Preconditions:** 호스트 1명이 있는 대기실
- **Test steps:** 두 번째, 가능하면 세 번째 참가자가 순서대로 입장한다. 모든 화면의 목록을 비교한다.
- **Expected result:** 모든 화면에 동일한 참가자가 입장 순서대로 표시되고 색상이 중복되지 않는다. 방 생성자에게만 `HOST`가 표시된다.
- **필요한 기기/인원:** 2~3개 세션 / 2명 이상 권장
- **검증 방식:** 부분 자동 + 사람

### [ ] WAIT-02 — 시작 권한과 시작 조건

- **Priority:** P0
- **Preconditions:** 2명 이상 입장한 대기실
- **Test steps:**
  1. 카메라 미준비 상태에서 호스트의 시작 버튼 상태를 확인한다.
  2. 게스트 화면에 시작 버튼이 없는지 확인한다.
  3. 한 명만 READY로 만든 뒤 다시 확인한다.
  4. 전원이 READY가 된 뒤 호스트가 한 번만 시작한다.
- **Expected result:** 2명 이상이면서 전원이 READY일 때만 호스트가 시작할 수 있다. 게스트는 시작할 수 없고, 시작 후 모든 참가자가 같은 Round 1로 이동한다.
- **필요한 기기/인원:** 2대 / 2명
- **검증 방식:** 부분 자동 + 사람

## 3. Camera Permission

### [ ] CAM-01 — 카메라 허용 및 READY 반영

- **Priority:** P0
- **Preconditions:** 카메라 권한이 아직 결정되지 않은 브라우저, 대기실 입장 완료
- **Test steps:** `카메라 준비`를 누르고 권한을 허용한다. 로컬 미리보기와 모든 참가자의 목록을 확인한다.
- **Expected result:** 실제 전면 카메라 미리보기가 나오고 본인은 `내 카메라 준비 완료`, 모든 기기에서는 해당 플레이어가 `READY`로 보인다.
- **필요한 기기/인원:** 대상 기기 1대 + 목록 확인용 다른 기기 권장
- **검증 방식:** 사람

### [ ] CAM-02 — 권한 거부 후 복구

- **Priority:** P1
- **Preconditions:** 카메라 권한을 초기화할 수 있는 별도 브라우저 세션
- **Test steps:**
  1. `카메라 준비` 후 권한을 거부한다.
  2. 오류 안내와 READY 상태를 확인한다.
  3. 브라우저 설정에서 권한을 허용한 뒤 다시 `카메라 준비`를 누른다.
- **Expected result:** 거부 상태에서는 READY가 되지 않고 게임 시작 조건을 충족하지 않는다. 권한을 허용한 뒤 미리보기와 READY 상태로 정상 복구된다.
- **필요한 기기/인원:** 1대 / 1명
- **검증 방식:** 사람

## 4. Round Start / Timer

### [ ] TIMER-01 — 공유 `starts_at` 기반 Round 1 동기화

- **Priority:** P0
- **Preconditions:** 서로 다른 실제 기기 2대, 전원 READY
- **Test steps:** 호스트가 시작한 뒤 두 화면을 나란히 촬영한다. reference 표시, 3초 관찰, 5→1 countdown, 자동 촬영 시점을 비교한다.
- **Expected result:** 두 기기에 같은 reference가 표시되고 약 3초 관찰 후 5초 countdown이 진행된다. Realtime 수신 시점 차이와 무관하게 촬영 시점이 눈에 띄게 벌어지지 않는다.
- **필요한 기기/인원:** Mac Chrome + iPhone Safari / 2명 권장
- **검증 방식:** 사람

### [ ] TIMER-02 — 5개 라운드 번호와 meme 중복 없음

- **Priority:** P0
- **Preconditions:** 5라운드 완주 가능한 게임
- **Test steps:** 각 라운드의 `ROUND N · N/5`와 reference meme을 기록한다.
- **Expected result:** 1/5부터 5/5까지 순서대로 한 번씩 나오고, 한 게임 안에서 reference meme 5개가 서로 다르다. 같은 라운드에서는 모든 기기에 동일한 meme이 보인다.
- **필요한 기기/인원:** 2대 이상 / 2명 이상
- **검증 방식:** 부분 자동(DB 선택 제약/상태) + 사람

## 5. Capture / Upload

### [ ] CAP-01 — 자동 촬영, 단일 제출, 전체 제출 대기

- **Priority:** P0
- **Preconditions:** 진행 중인 라운드, 모든 카메라 정상
- **Test steps:** countdown 중 조작하지 않고 촬영까지 기다린다. 한 기기가 먼저 제출되면 다른 기기는 잠시 늦게 네트워크를 복구하거나 정상 제출까지 기다린다.
- **Expected result:** countdown 종료 시 사용자 클릭 없이 각 기기가 한 번 촬영한다. 촬영 사진 preview가 보이고, 먼저 끝난 기기는 `제출 완료 · 다른 플레이어를 기다리는 중 (N/전체)`을 표시한다. 모든 제출 전에는 AI 판정이 시작되지 않는다.
- **필요한 기기/인원:** 2대 이상 / 2명 이상
- **검증 방식:** 부분 자동 + 사람

### [ ] CAP-02 — Upload 실패 후 같은 Blob 재업로드

- **Priority:** P1
- **Preconditions:** Desktop Chrome DevTools로 촬영 직후 네트워크를 잠시 Offline 전환할 수 있는 테스트 세션
- **Test steps:**
  1. 자동 촬영 직후 upload 단계에서 네트워크를 Offline으로 만든다.
  2. 오류와 `같은 사진 다시 업로드` 버튼을 확인한다.
  3. 화면의 촬영 사진을 식별할 수 있게 기록하고 네트워크를 Online으로 복구한다.
  4. 재업로드 버튼을 누른다.
- **Expected result:** 새로운 countdown이나 재촬영 없이 동일한 preview 사진이 제출된다. 제출은 한 건으로 기록되고 게임이 계속된다.
- **필요한 기기/인원:** Chrome 1대 + 게임 유지용 다른 참가자 1대 / 2명 권장
- **검증 방식:** 부분 자동 + 사람

### [ ] CAP-03 — 시스템 촬영 실패 시에만 재촬영 제공

- **Priority:** P1
- **Preconditions:** 진행 중 카메라 stream을 OS/브라우저에서 실제로 끊을 수 있는 세션
- **Test steps:** countdown 또는 다음 라운드 준비 중 카메라 사용을 중단시켜 capture failure를 유도한다. 오류 후 재시도 버튼으로 권한/stream을 복구한다.
- **Expected result:** 성공한 사진에는 retake 버튼이 없다. 시스템 오류로 사진이 생성되지 않은 경우에만 `촬영 오류 재시도`가 나타나며, 재시도 후 촬영·제출할 수 있다.
- **필요한 기기/인원:** 2대 / 2명 권장
- **검증 방식:** 사람

## 6. AI Judging

### [ ] AI-01 — 모든 제출 후 단일 judging과 정상 scoring

- **Priority:** P0
- **Preconditions:** 모든 active player의 사진 제출 완료
- **Test steps:** 두 기기에서 제출 완료 이후 상태를 관찰하고 Vercel Runtime log를 함께 확인한다.
- **Expected result:** `Gemini AI 판정 중…`으로 이동하고 라운드당 atomic claim 성공 1건만 실제 scoring을 수행한다. 60초 Runtime Timeout 없이 점수 결과 또는 invalid 결과로 종료된다.
- **필요한 기기/인원:** 2대 이상 / 2명 이상, Vercel log 접근자 1명
- **검증 방식:** 부분 자동 + 사람

### [ ] AI-02 — Gemini retry 및 invalid 처리 (조건부)

- **Priority:** P0
- **Preconditions:** QA 중 자연 발생한 Gemini 오류/timeout이 있을 때만 실행
- **Test steps:** Vercel log에서 해당 라운드의 `gemini_attempt_1`, `gemini_attempt_2`, `invalidate_round`을 확인하고 클라이언트 흐름을 관찰한다.
- **Expected result:** 첫 실패 후 정확히 한 번 재시도한다. 두 번째도 실패하면 Vercel hard timeout 전에 라운드가 invalid가 되고, 점수·승리 없이 결과 화면을 거쳐 다음 라운드 또는 Final Result로 진행한다.
- **필요한 기기/인원:** 당시 게임 참가 기기 + Vercel log 접근
- **검증 방식:** 자동 가능(log/DB) + 사람; 장애가 없으면 `N/A — 자연 장애 없음` 기록

## 7. Score Reveal / Round Winner

### [ ] SCORE-01 — 순차 점수 공개와 동기화율 계산

- **Priority:** P0
- **Preconditions:** 정상 판정이 완료된 라운드
- **Test steps:** 결과 화면을 녹화하며 표정, 포즈, 스타일, 종합 점수 표시 순서를 확인한다. DB의 category score와 화면 값을 비교한다.
- **Expected result:** 표정이 먼저 보이고 포즈 → 스타일 → 종합/승자 순으로 공개된다. category는 `score × 10%`, 종합은 `round(total / 30 × 100)%`와 일치한다. 모든 기기의 값이 동일하다.
- **필요한 기기/인원:** 2대 이상 / 2명 이상, Supabase read-only 확인 선택
- **검증 방식:** 자동 가능(계산/DB) + 사람

### [ ] SCORE-02 — Round winner 및 tie rule

- **Priority:** P0
- **Preconditions:** 정상 완료 라운드와 해당 round score/key category를 read-only로 확인 가능
- **Test steps:** total, meme key category, 세 category의 minimum, second-lowest 순으로 DB 점수를 비교해 화면 winner와 대조한다. 완전 동률이 자연 발생하면 joint winner 표시도 확인한다.
- **Expected result:** 승자는 raw total 우선이며 동점은 key category → minimum → second-lowest 순이다. 끝까지 같으면 공동 winner이고 각 winner에게 1승이 반영된다.
- **필요한 기기/인원:** 게임 참가자 2명 이상 + Supabase read-only 확인자
- **검증 방식:** 자동 가능(DB 함수/점수 대조) + 사람; 완전 동률 미발생 시 joint UI는 `N/A` 기록

## 8. Round Transition

### [ ] TRANS-01 — 정상 Round 1→5 자동 진행과 camera 재준비

- **Priority:** P0
- **Preconditions:** 정상 scoring 가능한 게임
- **Test steps:** Round 1 결과부터 Round 5까지 아무 참가자도 다음 버튼을 누르지 않고 진행한다. 각 결과 화면과 다음 라운드 카메라 preview를 관찰한다.
- **Expected result:** 정상 결과는 순차 공개를 포함해 약 8초 유지된 뒤 다음 라운드가 한 번만 시작된다. 매 라운드 새 자동 촬영이 수행되고 이전 round 사진/Blob/제출 상태가 남지 않는다. Round 6은 생성되지 않는다.
- **필요한 기기/인원:** 2대 이상 / 2명 이상
- **검증 방식:** 부분 자동 + 사람

### [ ] TRANS-02 — Invalid round 이후 게임 지속 (조건부)

- **Priority:** P0
- **Preconditions:** QA 중 자연 발생한 invalid round
- **Test steps:** invalid 화면과 다음 상태를 관찰한다.
- **Expected result:** `라운드 무효`가 표시되고 약 5초 뒤 다음 라운드로 자동 진행한다. Round 5 invalid라면 Final Result로 이동한다.
- **필요한 기기/인원:** 당시 게임 참가자
- **검증 방식:** 부분 자동 + 사람; invalid가 없으면 `N/A — 자연 장애 없음` 기록

## 9. Final Result / Ranking

### [ ] FINAL-01 — Round 5 이후 Final Result와 competition ranking

- **Priority:** P0
- **Preconditions:** 5라운드 완료
- **Test steps:** 모든 화면의 최종 결과를 비교하고 DB의 `final_results`를 read-only로 대조한다.
- **Expected result:** 방 상태가 finished이며 각 참가자의 rank, nickname, 총 승수, 누적 점수가 동일하게 보인다. 순위는 승수 → 누적 total → 2위 횟수 → worst-round total → best-round total 순이고 공동 순위 다음 번호는 competition ranking을 따른다.
- **필요한 기기/인원:** 2~4대 / 게임 참가 전원
- **검증 방식:** 자동 가능(DB ranking) + 사람

### [ ] FINAL-02 — Invalid round의 최종 통계 제외 (조건부)

- **Priority:** P0
- **Preconditions:** 한 개 이상의 자연 발생 invalid round를 포함해 게임 완료
- **Test steps:** 유효 라운드만 합산한 승수·누적 점수·worst/best 값을 직접 계산해 Final Result/DB와 비교한다.
- **Expected result:** invalid 라운드는 승수, 누적 점수, 2위 횟수, worst/best 계산에 포함되지 않는다.
- **필요한 기기/인원:** 해당 게임 참가자 + Supabase read-only 확인자
- **검증 방식:** 자동 가능; invalid가 없으면 `N/A — 자연 장애 없음` 기록

## 10. Realtime / Reconnect

### [ ] LIVE-01 — 대기실 Realtime 및 새로고침 복구

- **Priority:** P0
- **Preconditions:** 2명 이상 대기실
- **Test steps:** 한 참가자가 READY 상태에서 새로고침한다. 다른 참가자의 READY 변경 또는 신규 입장을 관찰한다.
- **Expected result:** 저장된 방 snapshot으로 같은 대기실과 본인 멤버십이 복구된다. 참가자/READY 변경이 새로고침 없이 다른 화면에 반영된다.
- **필요한 기기/인원:** 2대 / 2명
- **검증 방식:** 사람

### [ ] LIVE-02 — 라운드 진행 중 새로고침 복구

- **Priority:** P0
- **Preconditions:** Round 2~4의 scheduled/관찰/countdown/제출 대기 중인 게임
- **Test steps:** 한 기기를 새로고침하고 현재 DB 상태로 돌아오는지 확인한다. 공유 촬영 시각을 이미 놓친 경우 표시되는 복구 동작도 확인한다.
- **Expected result:** 다른 라운드나 대기실로 돌아가지 않고 현재 round number/status/submission 상태가 복구된다. 이미 제출한 참가자는 새 사진을 촬영하거나 중복 제출하지 않는다.
- **필요한 기기/인원:** 2대 / 2명
- **검증 방식:** 사람

### [ ] LIVE-03 — background/foreground 및 offline/online 복구

- **Priority:** P0
- **Preconditions:** iPhone Safari가 Round 2~4 진행 중
- **Test steps:**
  1. 결과 화면 또는 제출 대기 중 Safari를 background로 보낸다.
  2. 다른 기기에서 다음 상태로 진행될 때까지 기다린다.
  3. Safari를 foreground로 복귀한다.
  4. 추가로 네트워크를 잠시 끊었다가 복구한다.
- **Expected result:** visibility/online 복구 시 DB snapshot을 읽어 현재 라운드와 상태로 이동한다. 이전 라운드 timer가 재실행되거나 이미 제출한 사진이 다시 촬영되지 않는다.
- **필요한 기기/인원:** iPhone Safari + 다른 기기 / 2명
- **검증 방식:** 사람

### [ ] LIVE-04 — 결과/Final Result 새로고침

- **Priority:** P1
- **Preconditions:** 한 번은 round result, 한 번은 Final Result 상태
- **Test steps:** 각 상태에서 새로고침한다.
- **Expected result:** round result에서는 같은 점수·winner가 복구되고 남은 hold 이후 진행한다. finished 방에서는 동일한 Final Result가 다시 표시된다.
- **필요한 기기/인원:** 1대 / 1명
- **검증 방식:** 사람

## 11. Error / Recovery

### [ ] REC-01 — Stale judging 65초 복구 (조건부)

- **Priority:** P0
- **Preconditions:** Vercel hard termination 등으로 실제 round가 `judging`에 65초 이상 머문 경우에만 실행
- **Test steps:** 참가 기기를 열어 두거나 새로고침/foreground 복귀한다. recovery 요청과 DB 상태를 확인한다.
- **Expected result:** 검증된 참가자의 요청으로 해당 round가 한 번만 invalid 처리되고 약 5초 뒤 다음 라운드 또는 Final Result로 진행한다. 영구적으로 `Gemini AI 판정 중…`에 머물지 않는다.
- **필요한 기기/인원:** 해당 방 참가 기기 + Vercel/Supabase read-only 확인
- **검증 방식:** 자동 가능(log/DB) + 사람; stale이 없으면 `N/A — stale 미발생` 기록

### [ ] REC-02 — 일시적 snapshot/API 오류 후 게임 상태 보존

- **Priority:** P1
- **Preconditions:** 진행 중 게임, 브라우저에서 잠시 네트워크를 끊을 수 있음
- **Test steps:** 제출 성공이 화면에 확인된 직후 잠시 Offline으로 전환했다가 Online으로 복구한다.
- **Expected result:** 이미 성공한 submission이 취소되지 않고 새 촬영을 요구하지 않는다. Online/Realtime snapshot 복구 후 실제 DB 상태로 이어진다.
- **필요한 기기/인원:** 2대 / 2명 권장
- **검증 방식:** 부분 자동 + 사람

## 12. 3-player / 4-player

### [ ] MULTI-01 — 3-player 5-round 완주

- **Priority:** P0
- **Preconditions:** 서로 다른 anonymous session 3개, 모든 카메라 사용 가능
- **Test steps:** 3명이 입장·READY 후 Round 1부터 Final Result까지 완주한다. 매 라운드 제출 카운트와 결과 인원을 기록한다.
- **Expected result:** 매 라운드 `3/3` 제출 뒤 한 번만 judging되고 세 사람 모두 점수를 받는다. 5라운드 후 세 사람의 ranking이 표시된다.
- **필요한 기기/인원:** 3대 권장 / 3명
- **검증 방식:** 부분 자동 + 사람

### [ ] MULTI-02 — 4-player 완주 및 5번째 입장 차단

- **Priority:** P0
- **Preconditions:** 서로 다른 anonymous session 5개 준비 가능
- **Test steps:**
  1. 4명이 같은 방에 입장한다.
  2. 시작 전 다섯 번째 세션이 같은 방에 입장하려 한다.
  3. 기존 4명은 READY 후 5라운드를 완주한다.
- **Expected result:** 대기실은 `4/4`, 좌석/색상은 4개로 고유하다. 다섯 번째 입장은 `Room is full` 계열 오류로 거절된다. 매 라운드 `4/4` 제출과 4명 scoring 후 Final Result에 4명 모두 존재한다.
- **필요한 기기/인원:** 4대 + 추가 세션 1개 / 4명 권장
- **검증 방식:** 부분 자동 + 사람

## 13. Mobile Safari

### [ ] SAFARI-01 — iPhone Safari 핵심 호환성

- **Priority:** P0
- **Preconditions:** iPhone Safari, Production HTTPS, 카메라 권한 초기화 가능
- **Test steps:** 초대 링크 접속 → 닉네임 입장 → 카메라 허용 → READY → 자동 촬영 → upload → 결과까지 한 라운드 이상 진행한다. 화면 회전은 하지 않고 기본 세로 모드를 사용한다.
- **Expected result:** inline video가 전체화면으로 튀지 않고 카메라 frame에 표시된다. countdown, JPEG capture, private upload와 결과 표시가 정상이며 UI 핵심 버튼이 화면 밖으로 겹치지 않는다.
- **필요한 기기/인원:** iPhone 1대 + 상대 참가자 기기 / 2명
- **검증 방식:** 사람

## 14. Desktop Chrome

### [ ] CHROME-01 — Mac Chrome 핵심 호환성 및 console

- **Priority:** P0
- **Preconditions:** 최신 Mac Chrome, DevTools 사용 가능
- **Test steps:** 방 생성부터 최소 한 라운드를 진행하고 Console/Network를 확인한다.
- **Expected result:** 카메라 preview/capture/upload/judging/result가 정상이다. 게임을 중단시키는 uncaught exception, unhandled rejection, 반복 4xx/5xx 요청이 없다.
- **필요한 기기/인원:** Mac Chrome + 상대 기기 / 2명
- **검증 방식:** 사람

## 15. BGM

### [ ] BGM-01 — 첫 interaction, loop, toggle, 화면 전환 유지

- **Priority:** P1
- **Preconditions:** 새 탭에서 Production 접속, 기기 음량 ON
- **Test steps:**
  1. 페이지 로드 직후 사용자 interaction 전 재생 여부를 확인한다.
  2. 온보딩 화면을 클릭한 뒤 BGM 재생을 확인한다.
  3. OFF/ON 토글을 각각 누른다.
  4. 대기실→라운드→결과→다음 라운드로 이동한다.
- **Expected result:** interaction 전 강제 재생되지 않는다. 첫 interaction 후 낮은 음량으로 loop 재생되며 OFF는 즉시 정지, ON은 재생한다. 화면/라운드 전환 때 곡이 불필요하게 처음부터 재시작되지 않고, 재생 실패가 게임을 막지 않는다.
- **필요한 기기/인원:** 1대 / 1명
- **검증 방식:** 사람

## 16. Share / Invite

### [ ] SHARE-01 — 공유 링크와 직접 입장

- **Priority:** P0
- **Preconditions:** 대기실, 공유할 상대 기기
- **Test steps:** `초대 링크 공유`를 누른다. iPhone에서는 OS share sheet, 지원하지 않는 Desktop 환경에서는 clipboard fallback을 확인한다. 받은 링크를 새 세션에서 연다.
- **Expected result:** 링크가 현재 Production origin과 `?room=6자리코드`를 포함한다. 링크 접속자는 코드 입력을 건너뛰고 해당 방의 닉네임 입력 화면으로 이동하며 정상 입장할 수 있다.
- **필요한 기기/인원:** 2대 / 2명 또는 1명이 두 세션 사용
- **검증 방식:** 사람

## 17. Production / Branding

### [ ] PROD-01 — Production URL, metadata, favicon, 소셜 미리보기

- **Priority:** P1
- **Preconditions:** Vercel Production 배포 완료, 캐시 영향을 줄일 새 브라우저 세션
- **Test steps:** Production URL을 직접 열고 탭 title/favicon을 확인한다. 링크를 Open Graph를 표시하는 메신저/검사 도구에 붙여넣는다.
- **Expected result:** title, Open Graph, Twitter/X title은 `LikeMEME`; description은 `AI가 판정하는 실시간 밈 싱크로율 배틀`; favicon은 LikeMEME 브랜드다. `FollowMe`, localhost 또는 Preview deployment 이름이 노출되지 않는다.
- **필요한 기기/인원:** 1대 / 1명
- **검증 방식:** 자동 가능(metadata 응답) + 사람

### [ ] PROD-02 — Production 환경 연결과 사용자 오류 노출

- **Priority:** P0
- **Preconditions:** 새 incognito/private session, Vercel/Supabase log 접근 가능
- **Test steps:** Production 첫 접속 후 anonymous auth, 방 생성, 카메라 준비, 한 라운드 judging까지 수행한다. 화면과 log에서 연결 오류를 확인한다.
- **Expected result:** 환경변수 누락 안내, 인증 실패, Storage bucket 오류, Gemini key 오류가 없다. 화면에 secret/token/raw Gemini response가 표시되지 않는다.
- **필요한 기기/인원:** 2개 세션 / 1~2명
- **검증 방식:** 부분 자동 + 사람

---

## A. 혼자 지금 바로 테스트 가능한 항목

권장 순서:

1. `ROOM-02` 잘못된/없는 코드
2. `ROOM-03` 중복 닉네임 — 일반 창 + incognito 사용
3. `CAM-02` 권한 거부/복구
4. `BGM-01` autoplay/toggle/화면 전환
5. `SHARE-01` Desktop clipboard 또는 본인 기기로 링크 전달
6. `PROD-01` metadata/favicon/공유 미리보기
7. `ROOM-01`, `WAIT-01`, `LIVE-01` — 두 브라우저 프로필이나 Mac+iPhone을 혼자 조작 가능할 때

## B. 팀원 1명 필요 (총 2명)

권장 순서:

1. `ROOM-01` → `WAIT-02` → `CAM-01`
2. `TIMER-01` → `CAP-01` → `AI-01` → `SCORE-01`
3. 같은 게임에서 `TRANS-01` → `FINAL-01`
4. Round 2~4 사이에 `LIVE-02`, `LIVE-03`; 결과와 종료 시 `LIVE-04`
5. 별도 짧은 방에서 `ROOM-04`, `CAP-02`, `CAP-03`, `REC-02`
6. 전체 과정에서 `SAFARI-01`, `CHROME-01`, `PROD-02`를 함께 기록

이미 성공한 2-player 전체 E2E는 제출 직전 smoke에서 한 번만 반복한다.

## C. 팀원 2명 이상 필요 (3~4명)

권장 순서:

1. 먼저 `MULTI-02`의 4명 입장과 5번째 세션 차단을 확인한다.
2. 시간이 충분하면 그대로 4-player 5-round를 완주한다.
3. 4명 동시 일정이 어렵다면 `MULTI-01`의 3-player 5-round를 최우선으로 완주한다.
4. 플레이 중 `WAIT-01`, `TIMER-02`, `SCORE-02`, `FINAL-01`을 함께 검증한다.
5. AI/인프라 장애가 자연 발생한 경우에만 `AI-02`, `TRANS-02`, `FINAL-02`, `REC-01` 증거를 추가한다.

## D. 제출 직전 10분 smoke test

Mac Chrome + iPhone Safari, 총 2명 기준:

1. **0:00–1:00** — Production 새 탭 접속, `LikeMEME` title/favicon, 온보딩, BGM 시작 확인.
2. **1:00–2:00** — Mac에서 방 생성 및 공유 링크 전달, iPhone이 링크로 닉네임 입력 후 입장.
3. **2:00–3:00** — 양쪽 카메라 READY, Mac만 시작 버튼 사용 가능함을 확인하고 게임 시작.
4. **3:00–5:00** — Round 1에서 같은 meme, 3초 관찰, 5초 countdown, 자동 촬영, `2/2` 제출, Gemini 결과 확인.
5. **5:00–6:00** — category/overall/winner가 양쪽에서 동일하고 Round 2가 자동 시작하는지 확인.
6. **6:00–7:00** — iPhone을 background로 보냈다가 foreground로 복귀해 현재 DB 상태 복구 확인.
7. **7:00–9:00** — 게임은 계속 진행시키며 Vercel log에서 Runtime Timeout, 반복 judging, server error가 없는지 확인.
8. **9:00–10:00** — BGM OFF/ON, 공유 URL의 Production origin, 화면의 secret/debug/이전 브랜드 노출 여부 확인.

10분 안에 Final Result까지 도달하지 못해도 이 smoke에서는 Round 1 성공과 Round 2 전환을 필수 합격선으로 한다. 최종 제출 전 별도의 `MULTI-01` 또는 `MULTI-02` 완주 기록이 있어야 한다.
