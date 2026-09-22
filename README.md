# LikeMEME

<img width="860" height="430" alt="LIKEMEME_logo" src="https://github.com/user-attachments/assets/b4e109e0-40fc-42cc-85eb-29675789c610" />

**AI가 참가자들의 밈 따라하기 사진을 판정하는 2~4인 실시간 5라운드 웹 게임입니다.**

## 프로젝트 소개

밈을 보고 따라 하는 놀이는 쉽고 직관적이지만, 여러 사람이 함께할 때 결과를 일관되게 비교하고 즉시 승자를 정하기는 어렵습니다. LikeMEME는 모든 참가자에게 같은 reference meme과 촬영 시각을 제공하고, AI가 각 사진의 표정·포즈·스타일 유사도를 동일한 기준으로 평가합니다.

사용자는 별도 계정 없이 방 코드나 초대 링크로 참여합니다. 카메라 앞에서 밈을 따라 하면 countdown 종료 시 사진이 자동 촬영되고, 모든 참가자의 제출이 끝난 뒤 AI 판정 결과와 라운드 승자가 모든 화면에 동기화됩니다.


## AI 활용 방식 및 결과
기획부터 디자인, 개발, 사운드 제작까지 전 과정에 AI를 활용했다. 

Gemini 3.5 Flash-Lite는 원본 밈과 참가자의 촬영 이미지를 멀티모달로 분석하고, 표정·포즈·스타일의 유사도 점수를 산출하는 핵심 판정 기능에 사용했다. Codex는 게임 규칙과 AI 채점 기준을 구체화하고, Next.js 기반 웹 서비스 구현과 디버깅, 코드 검증 및 배포 과정을 보조했으며, 서비스 콘셉트에 맞는 로고와 UI 컴포넌트 제작에도 활용했다. 

Figma MCP는 재사용 가능한 컴포넌트와 변형을 Figma에 직접 구성해 디자인 시스템을 정리하고, 디자인과 개발 환경을 연결하는 데 사용했다. Lovable은 초기 아이디어를 웹 UI 프로토타입으로 빠르게 구현해 화면 구성과 사용자 플로우를 탐색하는 데 활용했으며, Suno는 라운드 진행과 게임의 몰입도를 높이는 BGM 제작에 사용했다.


## 사용한 AI 툴
- **Gemini 3.5 Flash-Lite**

  원본 밈과 참가자 촬영 이미지의 멀티모달 분석 및 유사도 점수 산출
    
- **Codex**

  Next.js 기반 웹 서비스 구현, 디버깅, 코드 검증 및 배포 과정 보조
    게임 규칙과 AI 채점 기준을 구체화, 서비스 컨셉과 맞는 로고 및 UI 컴포넌트 디자인 제작 보조
    
- **Figma MCP**

  재사용 가능한 컴포넌트와 변형을 Figma에 직접 구성하고 디자인 시스템 정리
    Figma 디자인을 개발 환경과 연결해 UI 구현 과정에 활용
    
- **Lovable**

  초기 아이디어를 바탕으로 웹 UI 프로토타입을 빠르게 생성하고, 화면 구성과 사용자 플로우를 구체화하는 디자인 탐색 과정에 활용
    
- **Suno**

  게임의 분위기와 플레이 경험에 맞는 BGM을 생성해 라운드 진행 및 게임 몰입도를 높이는 사운드 요소 제작에 활용


## 기술 스택
- ![Next JS](https://img.shields.io/badge/Next-%23000.svg?style=for-the-badge&logo=next.js&logoColor=white) ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) — 프론트엔드
- ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) — UI
- ![Supabase](https://img.shields.io/badge/Supabase-%233ECF8E.svg?style=for-the-badge&logo=supabase&logoColor=white) — 백엔드·DB·실시간 통신·스토리지
- ![Google Gemini](https://img.shields.io/badge/google%20gemini-%238E75B2.svg?style=for-the-badge&logo=google%20gemini&logoColor=white) **`Gemini 3.5 Flash-Lite`** — AI 이미지 판정
- ![Vercel](https://img.shields.io/badge/vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white) — 서버·배포
- ![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white) — 버전 관리
- ![Figma](https://img.shields.io/badge/figma-%23F24E1E.svg?style=for-the-badge&logo=figma&logoColor=white) — UI/UX 디자인


## 팀
<td><a href="https://github.com/frutacruda">@frutacruda</a></td>
<td><a href="https://github.com/glace0x">@glace0x</a></td>
<td><a href="https://github.com/strongwest">@strongwest</a></td>
