"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "requesting" | "preparing" | "observing" | "countdown" | "capturing" | "complete" | "error";
export type Capture = { blob: Blob; url: string; width: number; height: number };

function cameraMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "카메라 권한을 허용해주세요. 차단했다면 브라우저의 사이트 설정에서 변경해주세요.";
    if (error.name === "NotFoundError") return "사용 가능한 카메라가 없습니다.";
    if (error.name === "NotReadableError") return "카메라를 사용할 수 없습니다. 다른 앱의 카메라 사용을 종료해주세요.";
  }
  return error instanceof Error ? error.message : "카메라를 준비하지 못했습니다.";
}

export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const cleanupRef = useRef<() => void>(() => {});
  const urlRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);

  useEffect(() => () => {
    generation.current += 1;
    cleanupRef.current();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function start() {
    if (phaseRef.current !== "idle" && phaseRef.current !== "error") return;
    const run = ++generation.current;
    const current = () => generation.current === run;
    const transition = (next: Phase) => {
      phaseRef.current = next;
      setPhase(next);
    };
    transition("requesting");
    setError(null);
    let timer: ReturnType<typeof setInterval> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let removeTrackListeners = () => {};
    const cleanup = () => {
      clearInterval(timer);
      clearTimeout(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      removeTrackListeners();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    const fail = (message: string) => {
      if (!current()) return;
      generation.current += 1;
      cleanup();
      setError(message);
      transition("error");
    };
    function onVisibility() {
      if (document.hidden) fail("화면이 숨겨져 촬영을 중단했습니다. 화면을 켠 상태에서 다시 진행해주세요.");
    }
    function onPageHide() { fail("페이지 이동으로 촬영이 중단되었습니다."); }
    cleanupRef.current = cleanup;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    try {
      if (!window.isSecureContext) throw new Error("카메라는 HTTPS 또는 이 기기의 localhost에서 사용할 수 있습니다.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않습니다. Chrome 또는 Safari에서 열어주세요.");
      watchdog = setTimeout(() => fail("카메라 권한 응답을 기다리는 시간이 초과되었습니다. 권한을 확인하고 다시 진행해주세요."), 30_000);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      clearTimeout(watchdog);
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("카메라 영상 트랙을 찾지 못했습니다.");
      const interrupted = () => fail("카메라 영상이 중단되었습니다. 카메라 상태를 확인하고 다시 진행해주세요.");
      track.addEventListener("ended", interrupted);
      track.addEventListener("mute", interrupted);
      removeTrackListeners = () => {
        track.removeEventListener("ended", interrupted);
        track.removeEventListener("mute", interrupted);
      };
      const video = videoRef.current;
      if (!video) throw new Error("카메라 미리보기를 준비하지 못했습니다.");
      transition("preparing");
      video.srcObject = stream;
      watchdog = setTimeout(() => fail("카메라 영상이 준비되지 않았습니다. 다시 진행해주세요."), 10_000);
      await video.play();
      if (!current()) return;

      // Wait for a progressing frame, not merely permission or metadata.
      let lastVideoTime = video.currentTime;
      let lastFrameAt = performance.now();
      let observationStart: number | null = null;
      timer = setInterval(() => {
        if (!current()) return;
        const now = performance.now();
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          lastFrameAt = now;
          if (observationStart === null && video.readyState >= 2 && video.videoWidth > 0) {
            clearTimeout(watchdog);
            observationStart = now;
            transition("observing");
          }
        }
        if (observationStart === null) return;
        if (document.hidden || video.paused || track.readyState !== "live" || track.muted || now - lastFrameAt > 1500) {
          fail("카메라의 새 영상 프레임을 확인할 수 없어 촬영을 중단했습니다.");
          return;
        }
        const elapsed = now - observationStart;
        if (elapsed < 3000) {
          setSeconds(Math.ceil((3000 - elapsed) / 1000));
        } else if (elapsed < 8000) {
          if (phaseRef.current !== "countdown") transition("countdown");
          setSeconds(Math.ceil((8000 - elapsed) / 1000));
        } else {
          clearInterval(timer);
          if (elapsed > 9500) {
            fail("촬영 시간이 지연되어 중단했습니다. 다시 진행해주세요.");
            return;
          }
          transition("capturing");
          try {
            if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error("촬영할 영상이 없습니다.");
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("사진 생성 기능을 사용할 수 없습니다.");
            // Store the mirrored preview without cropping.
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            watchdog = setTimeout(() => fail("사진 저장 시간이 초과되었습니다."), 5000);
            canvas.toBlob((blob) => {
              if (!current()) return;
              if (!blob?.size) { fail("촬영 사진을 생성하지 못했습니다."); return; }
              const url = URL.createObjectURL(blob);
              urlRef.current = url;
              setCapture({ blob, url, width: canvas.width, height: canvas.height });
              cleanup();
              transition("complete");
            }, "image/jpeg", 0.85);
          } catch (error) { fail(cameraMessage(error)); }
        }
      }, 50);
    } catch (error) { fail(cameraMessage(error)); }
  }

  return { videoRef, phase, seconds, error, capture, start };
}
