"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BGM_PATH = "/audio/cyber-rally.mp3";
const BGM_VOLUME = 0.18;

export default function BgmController() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [interactionReceived, setInteractionReceived] = useState(false);

  const playSafely = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().catch(() => {
      // Audio is optional. Autoplay or device errors must never affect gameplay.
    });
  }, []);

  useEffect(() => {
    const audio = new Audio(BGM_PATH);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = BGM_VOLUME;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (interactionReceived) return;

    const onFirstInteraction = (event: Event) => {
      setInteractionReceived(true);
      const soundControl = event.target instanceof Element && event.target.closest(".bgm-toggle");
      if (enabled && !soundControl) playSafely();
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };

    window.addEventListener("pointerdown", onFirstInteraction);
    window.addEventListener("keydown", onFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [enabled, interactionReceived, playSafely]);

  const toggle = () => {
    const audio = audioRef.current;
    if (enabled) {
      audio?.pause();
      setEnabled(false);
      return;
    }

    setEnabled(true);
    setInteractionReceived(true);
    playSafely();
  };

  return (
    <button
      type="button"
      className="bgm-toggle"
      aria-label={enabled ? "배경음악 끄기" : "배경음악 켜기"}
      aria-pressed={enabled}
      onClick={toggle}
    >
      BGM {enabled ? "ON" : "OFF"}
    </button>
  );
}
