"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "requesting" | "preparing" | "ready" | "observing" | "countdown" | "capturing" | "complete" | "error";
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
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const lastFrameRef = useRef({ videoTime: 0, at: 0 });
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);

  const transition = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoElementRef.current) videoElementRef.current.srcObject = null;
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    stopTimer();
    stopStream();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setCapture(null);
    setError(null);
    setSeconds(0);
    transition("idle");
  }, [stopStream, stopTimer, transition]);

  const fail = useCallback((message: string) => {
    generation.current += 1;
    stopTimer();
    stopStream();
    setError(message);
    transition("error");
  }, [stopStream, stopTimer, transition]);

  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoElementRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      void node.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    function onVisibility() {
      if (document.hidden && !["idle", "complete", "error"].includes(phaseRef.current)) {
        fail("화면이 숨겨져 촬영을 중단했습니다. 화면을 켠 상태에서 다시 진행해주세요.");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fail]);

  useEffect(() => () => {
    generation.current += 1;
    stopTimer();
    stopStream();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, [stopStream, stopTimer]);

  const prepare = useCallback(async () => {
    if (streamRef.current?.active && phaseRef.current === "ready") return;
    if (["requesting", "preparing", "observing", "countdown", "capturing", "complete"].includes(phaseRef.current)) return;

    const run = ++generation.current;
    transition("requesting");
    setError(null);
    stopStream();

    try {
      if (!window.isSecureContext) throw new Error("카메라는 HTTPS 또는 이 기기의 localhost에서 사용할 수 있습니다.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 카메라를 지원하지 않습니다. Chrome 또는 Safari에서 열어주세요.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (generation.current !== run) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("카메라 영상 트랙을 찾지 못했습니다.");
      streamRef.current = stream;
      track.addEventListener("ended", () => fail("카메라 영상이 중단되었습니다. 다시 준비해주세요."), { once: true });
      transition("preparing");

      const video = videoElementRef.current;
      if (!video) throw new Error("카메라 미리보기를 준비하지 못했습니다.");
      video.srcObject = stream;
      await video.play();

      const startedAt = performance.now();
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          if (generation.current !== run) return reject(new Error("카메라 준비가 중단되었습니다."));
          if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > 0) return resolve();
          if (performance.now() - startedAt > 10_000) return reject(new Error("카메라 영상이 준비되지 않았습니다."));
          requestAnimationFrame(check);
        };
        check();
      });

      lastFrameRef.current = { videoTime: video.currentTime, at: performance.now() };
      transition("ready");
    } catch (prepareError) {
      if (generation.current === run) fail(cameraMessage(prepareError));
      throw prepareError;
    }
  }, [fail, stopStream, transition]);

  const captureFrame = useCallback((run: number) => {
    const video = videoElementRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      fail("촬영할 카메라 영상이 없습니다.");
      return;
    }

    transition("capturing");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("사진 생성 기능을 사용할 수 없습니다.");
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (generation.current !== run) return;
        if (!blob?.size) {
          fail("촬영 사진을 생성하지 못했습니다.");
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setCapture({ blob, url, width: canvas.width, height: canvas.height });
        stopStream();
        transition("complete");
      }, "image/jpeg", 0.85);
    } catch (captureError) {
      fail(cameraMessage(captureError));
    }
  }, [fail, stopStream, transition]);

  const schedule = useCallback((startsAtMs: number) => {
    if (!streamRef.current?.active || phaseRef.current !== "ready") {
      fail("카메라가 준비되지 않아 촬영을 시작할 수 없습니다.");
      return;
    }

    const run = generation.current;
    stopTimer();
    timerRef.current = setInterval(() => {
      if (generation.current !== run) return;
      const video = videoElementRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!video || !track || track.readyState !== "live" || video.paused) {
        fail("카메라의 새 영상 프레임을 확인할 수 없어 촬영을 중단했습니다.");
        return;
      }

      const performanceNow = performance.now();
      if (video.currentTime !== lastFrameRef.current.videoTime) {
        lastFrameRef.current = { videoTime: video.currentTime, at: performanceNow };
      }
      if (performanceNow - lastFrameRef.current.at > 1500) {
        fail("카메라의 새 영상 프레임을 확인할 수 없어 촬영을 중단했습니다.");
        return;
      }

      const elapsed = Date.now() - startsAtMs;
      if (elapsed < 0) {
        transition("ready");
        setSeconds(Math.ceil(-elapsed / 1000));
      } else if (elapsed < 3000) {
        transition("observing");
        setSeconds(Math.ceil((3000 - elapsed) / 1000));
      } else if (elapsed < 8000) {
        transition("countdown");
        setSeconds(Math.ceil((8000 - elapsed) / 1000));
      } else {
        stopTimer();
        if (elapsed > 9500) {
          fail("공유 촬영 시각을 놓쳤습니다. 다시 촬영해주세요.");
          return;
        }
        captureFrame(run);
      }
    }, 50);
  }, [captureFrame, fail, stopTimer, transition]);

  const start = useCallback(async () => {
    await prepare();
    schedule(Date.now());
  }, [prepare, schedule]);

  const retryCapture = useCallback(async () => {
    await prepare();
    schedule(Date.now() - 8000);
  }, [prepare, schedule]);

  const prepareNextRound = useCallback(async () => {
    reset();
    await prepare();
  }, [prepare, reset]);

  return { videoRef, phase, seconds, error, capture, prepare, schedule, start, retryCapture, reset, prepareNextRound };
}
