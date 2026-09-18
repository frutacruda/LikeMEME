# LikeMEME

AI가 참가자들의 짤 따라하기 사진을 평가하는 2~4인 실시간 웹 게임.

## Development Goal

- ASAP로 동작하는 MVP 완성을 최우선한다.
- 기능명세에 없는 기능을 임의로 추가하지 않는다.
- 과도한 추상화와 미래 확장용 구조를 만들지 않는다.
- 현재 작업에 필요한 파일과 코드만 확인한다.
- 기존에 정상 동작하는 기능을 불필요하게 수정하지 않는다.

## Stack

- TypeScript
- Next.js (App Router)
- React
- Tailwind CSS
- Supabase: Database / Realtime / Storage
- Vision AI API
- Vercel
- GitHub

기술검증 결과에 따라 변경될 수 있다.

## Product Rules

상세 기능과 게임 규칙은 `docs/FUNCTIONAL_SPEC.md`를 기준으로 한다.
기능 구현 전에 해당 작업과 관련된 명세를 확인한다.

## Agent Rules

- 작업 시작 전 현재 코드와 관련 문서를 확인한다.
- 요청받은 scope 밖의 기능을 구현하지 않는다.
- 다른 에이전트가 작업할 가능성을 고려해 unrelated file을 수정하지 않는다.
- 기존 public interface를 임의로 변경하지 않는다.
- 공통 interface 변경이 필요하면 구현 전에 알린다.
- 새로운 dependency는 꼭 필요한 경우에만 추가한다.
- `.env*`, API key, secret을 commit하지 않는다.
- 작업 완료 후 변경 파일과 주요 변경사항을 요약한다.
- 가능한 경우 lint/type check를 실행한다.

## Parallel Development

여러 에이전트가 동시에 작업할 경우:
- 하나의 task는 하나의 명확한 기능 영역만 담당한다.
- 다른 task의 파일을 불필요하게 수정하지 않는다.
- 공통 타입/DB schema/API contract를 임의로 변경하지 않는다.
- 공통 구조 변경이 필요한 경우 먼저 공유한다.
