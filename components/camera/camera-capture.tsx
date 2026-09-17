"use client";

import { useCameraCapture } from "./use-camera-capture";

export default function CameraCapture() {
  const { videoRef, phase, seconds, error, capture, start } = useCameraCapture();
  const labels = {
    idle: "카메라를 켜면 촬영이 자동으로 진행됩니다.",
    requesting: "카메라 권한을 허용해주세요.",
    preparing: "카메라 영상을 준비하고 있습니다.",
    observing: `짤 관찰 시간 · ${seconds}초`,
    countdown: `${seconds}초 후 자동 촬영`,
    capturing: "사진을 생성하고 있습니다.",
    complete: "촬영 완료",
    error: "촬영을 완료하지 못했습니다.",
  };

  return (
    <section className="w-full max-w-xl space-y-5" aria-label="자동 카메라 촬영">
      <div className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
        <p className="font-semibold">짤 공개를 가정한 촬영 화면</p>
        <p className="mt-2 text-sm">카메라 준비 후 3초 관찰 → 5초 카운트다운 → 자동 촬영</p>
        <p className="mt-1 text-sm">화면을 켜둔 채 원하는 표정과 포즈를 취해주세요.</p>
      </div>
      <p role="status" aria-live="polite" className="text-center text-xl font-bold">{labels[phase]}</p>
      <div className="relative overflow-hidden rounded-xl bg-zinc-950">
        <video ref={videoRef} autoPlay muted playsInline aria-label="카메라 미리보기" className={`aspect-[3/4] w-full -scale-x-100 object-contain ${capture ? "hidden" : "block"}`} />
        {capture && (
          // A local blob URL needs no Next.js image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capture.url} width={capture.width} height={capture.height} alt="자동 촬영된 내 사진" className="aspect-[3/4] w-full object-contain" />
        )}
        {phase === "countdown" && <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold text-white drop-shadow-lg">{seconds}</span>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-400 p-3 text-sm">{error}</p>}
      {(phase === "idle" || phase === "error") && (
        <button type="button" onClick={start} className="min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
          {phase === "error" ? "오류 확인 후 다시 진행" : "카메라 켜고 시작"}
        </button>
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {capture ? "사진은 이 화면에서만 확인할 수 있으며 서버로 전송되지 않습니다. 촬영에 성공한 뒤에는 다시 촬영할 수 없습니다." : "카메라 권한이 필요합니다. 촬영 오류가 발생한 경우에만 다시 진행할 수 있습니다."}
      </p>
    </section>
  );
}
