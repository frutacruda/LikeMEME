This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 카메라 촬영

`npm run dev` 후 데스크톱 Chrome에서 `http://localhost:3000`을 엽니다.
카메라 켜고 시작 → 권한 허용 → 영상 준비 → 3초 관찰 → 5초 카운트다운 → 자동 촬영 순서입니다.
성공 후 재촬영 버튼은 없으며, 오류 발생 시에만 다시 진행할 수 있습니다.
사진은 메모리의 JPEG Blob으로만 유지하고 서버로 전송하지 않습니다.
새로고침하면 초기화됩니다. 서버 기반 라운드별 중복 제출 제한은 아직 범위에 포함하지 않습니다.

### 실제 iPhone Safari 확인

신뢰할 수 있는 HTTPS 주소에서 열어야 합니다. PC의 LAN IP로 HTTP 접속하면 카메라를 사용할 수 없습니다.
HTTPS 배포 주소를 사용하거나, 로컬 HTTPS를 구성합니다:

```sh
npm run dev -- --hostname 0.0.0.0 --experimental-https
```

로컬 HTTPS는 접속할 PC의 LAN IP가 포함된 인증서와 iPhone에서의 발급 CA 신뢰 설정이 필요합니다.
자동 생성된 localhost 인증서를 iPhone이 그대로 신뢰하는 것은 아닙니다.
필요하면 `--experimental-https-key`와 `--experimental-https-cert`로 해당 인증서를 지정합니다.

### 수동 확인 항목

- Chrome / 실제 iPhone Safari에서 권한 허용 후 영상이 나오며, 준비된 시점부터 관찰 3초와 카운트다운 5→4→3→2→1이 진행됩니다.
- 추가 터치 없이 사진이 생성되고, 미리보기와 같은 좌우 방향 및 전체 구도가 유지됩니다.
- 성공 후 다시 촬영 버튼이 없고 카메라 사용이 종료됩니다.
- 권한 거부, 카메라 없음/점유, 권한 요청을 30초 이상 방치했을 때 오류 안내가 표시됩니다.
- 진행 중 탭 전환, 화면 잠금 또는 앱 전환 시 오류 처리되고, 복귀 후 오류 재시도로만 다시 진행합니다.
- 세로/가로 방향에서 결과 사진이 찌그러지지 않는지 확인합니다.
- 빠른 시작 버튼 연타로 여러 카운트다운이 생기지 않는지 확인합니다.
- 사진은 네트워크로 전송되지 않으며 페이지를 떠나면 카메라가 해제됩니다.

### 재사용

`components/camera/use-camera-capture.ts`가 권한, 타이밍, 캡처, 자원 정리를 담당합니다.
`components/camera/camera-capture.tsx`는 임시 UI입니다. 실제 게임에서는 훅이 반환하는
`capture.blob`을 제출에 사용할 수 있습니다. 현재 타이밍은 로컬 카메라 준비 기준이며 서버 동기화는 아직 없습니다.
새 라운드에서는 별도 라운드 키로 컴포넌트를 마운트하는 방식으로 확장할 수 있습니다.
실패 감지는 권한·영상 준비·트랙 중단·프레임 진행 중단·이미지 생성 실패를 대상으로 하며,
어두운 방이나 렌즈 가림처럼 정상적으로 전달되는 영상의 내용은 판별하지 않습니다.
