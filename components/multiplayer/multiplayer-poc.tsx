"use client";

/* eslint-disable @next/next/no-img-element */

import { type ButtonHTMLAttributes, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCameraCapture } from "@/components/camera/use-camera-capture";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { FinalResult, RoomPlayer, RoomSnapshot, RoundSnapshot } from "@/lib/supabase/types";

const ROOM_STORAGE_KEY = "likememe.room-code";
const seatColors = ["#FF6B6B", "#4DABF7", "#51CF66", "#FFD43B"];

function messageFrom(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "요청을 처리하지 못했습니다.";
}

function isDuplicateUpload(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: string | number; message?: string };
  return String(value.statusCode) === "409" || /duplicate|already exists/i.test(value.message ?? "");
}

function OnboardingAction({
  children,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: "primary" | "secondary";
}) {
  return (
    <button className={`onboarding-room-action onboarding-room-action-${variant}`} type="button" {...props}>
      <img
        src={`/brand/onboarding-button-${variant}.svg`}
        alt=""
        width={420}
        height={54}
      />
      <span>{children}</span>
    </button>
  );
}

function PlayerStatusBar({ players, roundWins }: { players: RoomPlayer[]; roundWins: Record<string, number> }) {
  return (
    <ul className="play-player-status" aria-label="플레이어 현재 승수">
      {players.map((player) => (
        <li key={player.id}>
          <span className="play-player-identity">
            <span className="play-player-avatar" style={{ background: seatColors[player.seat - 1] }}>
              {player.nickname.slice(0, 1).toUpperCase()}
            </span>
            <span className="play-player-nickname">{player.nickname}</span>
          </span>
          <span className="play-player-wins">{roundWins[player.id] ?? 0}승</span>
        </li>
      ))}
    </ul>
  );
}

function RoundResultView({
  round,
  players,
  roundWins,
  videoRef,
  cameraError,
}: {
  round: RoundSnapshot;
  players: RoomPlayer[];
  roundWins: Record<string, number>;
  videoRef: (node: HTMLVideoElement | null) => void;
  cameraError: string | null;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [revealStep, setRevealStep] = useState(round.status === "invalid" ? 4 : 0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (round.status !== "complete") return;
    const timers = [
      window.setTimeout(() => setRevealStep(1), 50),
      window.setTimeout(() => setRevealStep(2), 1_250),
      window.setTimeout(() => setRevealStep(3), 2_450),
      window.setTimeout(() => setRevealStep(4), 3_650),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [round.status]);

  useEffect(() => {
    if (round.status !== "complete") return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return;
      const response = await fetch(`/api/rounds/${round.id}/photos`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) return;
      const body = await response.json() as { photos: Array<{ playerId: string; signedUrl: string }> };
      if (active) setPhotoUrls(Object.fromEntries(body.photos.map((photo) => [photo.playerId, photo.signedUrl])));
    })().catch(() => undefined);
    return () => { active = false; };
  }, [round.id, round.status, supabase]);

  const winnerScores = round.scores.filter((score) => score.is_winner);
  const winnerNames = winnerScores.map((score) => players.find((player) => player.id === score.player_id)?.nickname ?? "플레이어");
  const winnerSync = winnerScores[0] ? Math.round(winnerScores[0].total / 30 * 100) : 0;

  if (round.status === "invalid") return <main className="shell">
    <section className="card result-card">
      <span className="eyebrow">ROUND {round.number} RESULT · {round.number}/5</span>
      <h1>라운드 무효</h1>
      <p className="error">AI 판정에 실패했습니다. 승리와 점수 없이 다음 라운드로 진행합니다.</p>
      {round.number < 5 && <div className="result-camera-preserve"><video ref={videoRef} autoPlay muted playsInline className="camera-video" /></div>}
      {cameraError && <p className="error">{cameraError}</p>}
    </section>
  </main>;

  return <main className="live-judging-screen">
    <header className="live-judging-header">
      <img src="/brand/likememe-logo.png" alt="LikeMEME" />
      <h1>ROUND {String(round.number).padStart(2, "0")}</h1>
    </header>
    <section className={`live-judging-grid players-${round.scores.length}`} aria-label={`Round ${round.number} 점수 결과`}>
      {round.scores.map((score) => {
        const player = players.find((item) => item.id === score.player_id);
        const accent = seatColors[(player?.seat ?? 1) - 1];
        const categories = [
          { label: "표정", score: score.expression, step: 1 },
          { label: "포즈", score: score.pose, step: 2 },
          { label: "스타일", score: score.style, step: 3 },
        ];
        return <article
          className={`live-judge-card ${revealStep >= 4 && score.is_winner ? "is-winner" : ""}`}
          style={{ "--player-accent": accent } as CSSProperties}
          key={score.player_id}
        >
          <div className="live-judge-accent" />
          <div className="live-judge-photo">
            {photoUrls[score.player_id] && <img src={photoUrls[score.player_id]} alt={`${player?.nickname ?? "플레이어"}의 이번 라운드 사진`} />}
          </div>
          <h2>{player?.nickname}</h2>
          <div className="live-judge-categories">
            {categories.map((category) => {
              const revealed = revealStep >= category.step;
              return <div className={`live-score-line ${revealed ? "is-revealed" : ""}`} key={category.label}>
                <span className="live-score-label">{category.label}</span>
                <span className="live-score-track"><span style={{ width: revealed ? `${category.score * 10}%` : "0%" }} /></span>
                <strong>{revealed ? category.score : "–"}</strong>
              </div>;
            })}
          </div>
          <div className="live-judge-divider" />
          <div className={`live-overall ${revealStep >= 4 ? "is-revealed" : ""}`}>
            <span>유사도</span>
            <strong>{revealStep >= 4 ? `${Math.round(score.total / 30 * 100)}%` : "···"}</strong>
          </div>
        </article>;
      })}
    </section>
    {revealStep >= 4 && <section className="round-winner-screen" aria-label={`Round ${round.number} 우승자`}>
      <img className="round-winner-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
      <h1>ROUND {String(round.number).padStart(2, "0")} <span>WINNER</span></h1>
      <img className="round-winner-reference" src={round.reference_image_path} alt={`Round ${round.number} 기준 짤`} />
      <div className="round-winner-layout">
        <div className={`round-winner-stage winners-${winnerScores.length}`}>
          {winnerScores.map((score) => {
            const player = players.find((item) => item.id === score.player_id);
            return <div className="round-winner-photo" key={score.player_id}>
              {photoUrls[score.player_id] && <img src={photoUrls[score.player_id]} alt={`${player?.nickname ?? "플레이어"}의 우승 사진`} />}
            </div>;
          })}
        </div>
        <div className="round-winner-info">
          <p className="round-winner-name">{winnerNames.join(" · ")}</p>
          <div className="round-winner-emblem">
            <img className="round-winner-star-outer" src="/brand/winner-starburst-outer.svg" alt="" />
            <img className="round-winner-star-inner" src="/brand/winner-starburst-inner.svg" alt="" />
            <span className="round-winner-champion">ROUND CHAMPION</span>
            <strong className="round-winner-badge-title" aria-hidden="true">WINNER</strong>
            <span className="round-winner-badge-name">{winnerNames.join(" · ")}</span>
            <span className="round-winner-sync">SYNC {winnerSync}%</span>
          </div>
        </div>
      </div>
      <ul className="round-winner-players" aria-label="플레이어 현재 승수">
        {players.map((player) => {
          const isWinner = winnerScores.some((score) => score.player_id === player.id);
          return <li key={player.id}>
            <span className="play-player-identity">
              <span className="play-player-avatar" style={{ background: seatColors[player.seat - 1] }}>{player.nickname.slice(0, 1).toUpperCase()}</span>
              <span className="play-player-nickname">{player.nickname}</span>
              {isWinner && <span className="round-winner-plus">+ 1</span>}
            </span>
            <span className="play-player-wins">{roundWins[player.id] ?? 0}승</span>
          </li>;
        })}
      </ul>
    </section>}
    {round.number < 5 && <div className="result-camera-preserve"><video ref={videoRef} autoPlay muted playsInline className="camera-video" /></div>}
    {cameraError && <p className="live-result-error">{cameraError}</p>}
  </main>;
}

function FinalResultView({
  results,
  players,
  finalRound,
  onReturnToMain,
}: {
  results: FinalResult[];
  players: RoomPlayer[];
  finalRound: RoundSnapshot | null;
  onReturnToMain: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [countdown, setCountdown] = useState(3);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!finalRound) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return;
      const response = await fetch(`/api/rounds/${finalRound.id}/photos`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) return;
      const body = await response.json() as { photos: Array<{ playerId: string; signedUrl: string }> };
      if (active) setPhotoUrls(Object.fromEntries(body.photos.map((photo) => [photo.playerId, photo.signedUrl])));
    })().catch(() => undefined);
    return () => { active = false; };
  }, [finalRound, supabase]);

  const podiumResults = results.filter((result) => result.rank <= 3);
  const remainingResults = results.filter((result) => result.rank > 3);
  const synchronization = (result: FinalResult) => Math.round(result.cumulative_total / 150 * 100);

  if (countdown > 0) return <main className="final-reveal-screen">
    <header className="final-reveal-header">
      <img src="/brand/likememe-logo.png" alt="LikeMEME" />
      <strong>FINAL RESULT</strong>
    </header>
    <section className="final-reveal-intro">
      <h1>FINAL&nbsp;&nbsp; NOMINEES</h1>
      <p>5라운드 누적 승수와 싱크로율을 최종 집계합니다</p>
    </section>
    <section className={`final-nominee-grid players-${players.length}`} aria-label="최종 순위 후보">
      {players.map((player) => {
        const result = results.find((item) => item.player_id === player.id);
        return <article className="final-nominee-card" style={{ "--player-accent": seatColors[player.seat - 1] } as CSSProperties} key={player.id}>
          <div className="final-nominee-photo">
            {photoUrls[player.id] && <img src={photoUrls[player.id]} alt={`${player.nickname}의 마지막 라운드 사진`} />}
          </div>
          <h2>{player.nickname}</h2>
          <strong>{result?.round_wins ?? 0} {(result?.round_wins ?? 0) === 1 ? "WIN" : "WINS"}</strong>
          <span>CALCULATING...</span>
        </article>;
      })}
    </section>
    <footer className="final-reveal-countdown">
      <img src="/brand/likememe-logo.png" alt="" />
      <p>최종 1위 공개까지</p>
      <strong aria-live="polite">{String(countdown).padStart(2, "0")}</strong>
    </footer>
  </main>;

  return <main className="final-ranking-screen">
    <header className="final-ranking-header">
      <img src="/brand/likememe-logo.png" alt="LikeMEME" />
      <div>
        <h1>FINAL&nbsp;&nbsp; TOP 3</h1>
        <p>승수 우선 · 동률 시 누적 싱크로율 순</p>
      </div>
      <button className="final-play-again" type="button" onClick={onReturnToMain}>
        <img src="/brand/play-again-button.svg" alt="" />
        <span>PLAY AGAIN</span>
      </button>
    </header>
    <section className={`final-podium entries-${podiumResults.length}`} aria-label="최종 순위">
      {podiumResults.map((result) => {
        const player = players.find((item) => item.id === result.player_id);
        return <article className={`final-podium-card rank-${result.rank}`} key={result.player_id}>
          <strong className="final-podium-rank">{String(result.rank).padStart(2, "0")}</strong>
          {result.rank === 1 && <div className="final-champion-mark" aria-label="LikeMEME champion">
            <span aria-hidden="true">♛</span>
            <small>LIKE MEME CHAMPION</small>
          </div>}
          <h2>{player?.nickname ?? "플레이어"}</h2>
          <p>{result.round_wins} {result.round_wins === 1 ? "WIN" : "WINS"} <span>·</span> {synchronization(result)}% SYNC</p>
          {result.rank === 1 && <div className="final-trophy"><img src="/brand/final-trophy.png" alt="우승 트로피" /></div>}
        </article>;
      })}
    </section>
    {remainingResults.length > 0 && <section className="final-remaining" aria-label="나머지 최종 순위">
      {remainingResults.map((result) => {
        const player = players.find((item) => item.id === result.player_id);
        return <p key={result.player_id}><strong>{result.rank}위</strong><span>{player?.nickname ?? "플레이어"}</span><span>{result.round_wins}승</span><span>{synchronization(result)}% SYNC</span></p>;
      })}
    </section>}
  </main>;
}

export default function MultiplayerPoc() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const {
    videoRef,
    phase: cameraPhase,
    seconds: cameraSeconds,
    error: cameraError,
    capture,
    prepare,
    schedule,
    retryCapture,
    reset: resetCamera,
    prepareNextRound,
  } = useCameraCapture();
  const [ready, setReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "submitted" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [onboardingStarted, setOnboardingStarted] = useState(false);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [showCreateProgress, setShowCreateProgress] = useState(false);
  const [roundWins, setRoundWins] = useState<Record<string, number>>({});
  const roomCodeRef = useRef<string | null>(null);
  const createRequestSequenceRef = useRef(0);
  const snapshotRequestSequenceRef = useRef(0);
  const activeRoundIdRef = useRef<string | null>(null);
  const scheduledRoundRef = useRef<string | null>(null);
  const judgingRequestRef = useRef<string | null>(null);
  const preparedForNextRef = useRef<string | null>(null);

  const ensureAuthenticated = useCallback(async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    let session = sessionData.session;
    if (!session) {
      const { data: anonymousData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      session = anonymousData.session;
    }
    if (!session || session.user.aud !== "authenticated") {
      throw new Error("Authenticated Supabase session was not established.");
    }
    return session;
  }, [supabase]);

  const loadSnapshot = useCallback(async (roomCode: string) => {
    const requestSequence = ++snapshotRequestSequenceRef.current;
    const { data, error: rpcError } = await supabase.rpc("get_room_snapshot", { room_code: roomCode });
    if (requestSequence !== snapshotRequestSequenceRef.current) return;
    if (rpcError) throw rpcError;
    const snapshot = data as RoomSnapshot;
    if (snapshot.round?.id !== activeRoundIdRef.current) {
      activeRoundIdRef.current = snapshot.round?.id ?? null;
      scheduledRoundRef.current = null;
      judgingRequestRef.current = null;
      setUploadState("idle");
      setUploadError(null);
      setError(null);
    }
    roomCodeRef.current = snapshot.code;
    setRoom(snapshot);
    setPendingCode(null);
    localStorage.setItem(ROOM_STORAGE_KEY, snapshot.code);
    return snapshot;
  }, [supabase]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        await ensureAuthenticated();
        if (active) setAuthReady(true);
        const inviteCode = new URLSearchParams(window.location.search).get("room");
        const savedCode = localStorage.getItem(ROOM_STORAGE_KEY);
        const initialCode = inviteCode?.match(/^\d{6}$/)?.[0] ?? savedCode;
        if (initialCode) {
          try { await loadSnapshot(initialCode); }
          catch { if (active) setPendingCode(initialCode); }
        }
      } catch (initialError) {
        if (active) setError(messageFrom(initialError));
      } finally {
        if (active) setReady(true);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [ensureAuthenticated, loadSnapshot]);

  useEffect(() => {
    if (!room?.id) return;
    const refresh = () => {
      const code = roomCodeRef.current;
      if (code) void loadSnapshot(code).catch((refreshError) => setError(messageFrom(refreshError)));
    };
    const channel = supabase
      .channel(`room:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_submissions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_scores" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "final_results", filter: `room_id=eq.${room.id}` }, refresh)
      .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot, room?.id, supabase]);

  useEffect(() => {
    if (!room?.id || room.status === "waiting") return;
    let active = true;
    void (async () => {
      const { data: completedRounds, error: roundsError } = await supabase
        .from("rounds")
        .select("id")
        .eq("room_id", room.id)
        .eq("status", "complete");
      if (roundsError) throw roundsError;
      const roundIds = completedRounds.map((round) => round.id);
      if (roundIds.length === 0) {
        if (active) setRoundWins({});
        return;
      }
      const { data: winningScores, error: scoresError } = await supabase
        .from("round_scores")
        .select("player_id")
        .in("round_id", roundIds)
        .eq("is_winner", true);
      if (scoresError) throw scoresError;
      const nextWins: Record<string, number> = {};
      for (const score of winningScores) nextWins[score.player_id] = (nextWins[score.player_id] ?? 0) + 1;
      if (active) setRoundWins(nextWins);
    })().catch(() => {
      if (active) setRoundWins({});
    });
    return () => { active = false; };
  }, [room?.id, room?.round?.id, room?.round?.status, room?.status, supabase]);

  const ownSubmitted = Boolean(room?.round?.submitted_player_ids.includes(room.current_player_id));

  useEffect(() => {
    const round = room?.round;
    if (!round || round.status !== "scheduled" || ownSubmitted || cameraPhase !== "idle") return;
    const timer = window.setTimeout(() => {
      void prepare().catch((prepareError) => setError(messageFrom(prepareError)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cameraPhase, ownSubmitted, prepare, room?.round]);

  useEffect(() => {
    if (!room?.round || room.round.status !== "scheduled" || ownSubmitted || cameraPhase !== "ready") return;
    if (scheduledRoundRef.current === room.round.id) return;
    scheduledRoundRef.current = room.round.id;
    schedule(Date.parse(room.round.starts_at));
  }, [cameraPhase, ownSubmitted, room?.round, schedule]);

  useEffect(() => {
    const round = room?.round;
    if (!round || !["complete", "invalid"].includes(round.status) || round.number >= 5) return;
    if (preparedForNextRef.current === round.id) return;
    preparedForNextRef.current = round.id;
    const timer = window.setTimeout(() => {
      void prepareNextRound().catch((prepareError) => {
        preparedForNextRef.current = null;
        setError(messageFrom(prepareError));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [prepareNextRound, room?.round]);

  const submitCapture = useCallback(async () => {
    if (!room?.round || !room.current_player_id || !capture || uploadState === "uploading") return;
    const objectPath = `${room.id}/${room.round.number}/${room.current_player_id}.jpg`;
    setUploadState("uploading");
    setUploadError(null);
    const { error: storageError } = await supabase.storage
      .from("round-submissions")
      .upload(objectPath, capture.blob, { contentType: "image/jpeg", upsert: false });
    if (storageError && !isDuplicateUpload(storageError)) {
      setUploadState("error");
      setUploadError(`사진 업로드 실패: ${storageError.message}`);
      return;
    }
    const { error: submissionError } = await supabase.rpc("record_round_submission", {
      target_round_id: room.round.id,
      object_path: objectPath,
    });
    if (submissionError) {
      setUploadState("error");
      setUploadError(`제출 기록 실패: ${submissionError.message}`);
      return;
    }
    setUploadState("submitted");
    await loadSnapshot(room.code).catch((refreshError) => setError(messageFrom(refreshError)));
  }, [capture, loadSnapshot, room, supabase, uploadState]);

  useEffect(() => {
    if (!capture || uploadState !== "idle") return;
    const timer = window.setTimeout(() => void submitCapture(), 0);
    return () => window.clearTimeout(timer);
  }, [capture, submitCapture, uploadState]);

  useEffect(() => {
    const round = room?.round;
    if (!room || !round || round.status !== "scheduled") return;
    if (round.submitted_player_ids.length !== room.players.length) return;
    if (judgingRequestRef.current === round.id) return;
    judgingRequestRef.current = round.id;
    void (async () => {
      try {
        const session = await ensureAuthenticated();
        const response = await fetch(`/api/rounds/${round.id}/judge`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "AI 판정을 시작하지 못했습니다.");
        }
        await loadSnapshot(room.code);
      } catch (judgeError) {
        judgingRequestRef.current = null;
        setError(messageFrom(judgeError));
      }
    })();
  }, [ensureAuthenticated, loadSnapshot, room]);

  useEffect(() => {
    const round = room?.round;
    if (!room || !round || round.status !== "judging") return;
    let active = true;
    let timer: number | undefined;
    const recoverIfStale = async () => {
      try {
        const session = await ensureAuthenticated();
        const response = await fetch(`/api/rounds/${round.id}/recover`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) throw new Error("AI 판정 복구 상태를 확인하지 못했습니다.");
        const body = await response.json() as { recovered: boolean };
        if (!active) return;
        if (body.recovered) {
          await loadSnapshot(room.code);
          return;
        }
      } catch (recoveryError) {
        if (active) console.error("Stale judging recovery request failed", messageFrom(recoveryError));
      }
      if (active) timer = window.setTimeout(() => void recoverIfStale(), 5_000);
    };
    void recoverIfStale();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ensureAuthenticated, loadSnapshot, room]);

  useEffect(() => {
    const round = room?.round;
    if (!room || !round || !["complete", "invalid"].includes(round.status) || !round.result_ends_at) return;
    let active = true;
    let timer: number | undefined;
    const advance = async () => {
      try {
        const session = await ensureAuthenticated();
        const response = await fetch(`/api/rounds/${round.id}/advance`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? "다음 라운드로 진행하지 못했습니다.");
        }
        const body = await response.json() as { state: string };
        if (!active) return;
        if (body.state === "result_hold") {
          timer = window.setTimeout(() => void advance(), 500);
          return;
        }
        await loadSnapshot(room.code);
      } catch (advanceError) {
        if (!active) return;
        setError(messageFrom(advanceError));
        timer = window.setTimeout(() => void advance(), 2000);
      }
    };
    const delay = Math.max(0, Date.parse(round.result_ends_at) - Date.now() + 100);
    timer = window.setTimeout(() => void advance(), delay);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [ensureAuthenticated, loadSnapshot, room]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await ensureAuthenticated(); await action(); }
    catch (actionError) { setError(messageFrom(actionError)); }
    finally { setBusy(false); }
  }

  function createRoom() {
    const requestSequence = ++createRequestSequenceRef.current;
    setShowCreateProgress(true);
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("create_room");
      if (rpcError) throw rpcError;
      if (requestSequence !== createRequestSequenceRef.current) return;
      const roomCode = String(data);
      setPendingCode(roomCode);
      window.history.replaceState(null, "", `?room=${roomCode}`);
    }).finally(() => {
      if (requestSequence === createRequestSequenceRef.current) setShowCreateProgress(false);
    });
  }

  function chooseRoom() {
    const normalized = codeInput.replace(/\D/g, "").slice(0, 6);
    if (normalized.length !== 6) { setError("6자리 방 코드를 입력해 주세요."); return; }
    setError(null);
    setPendingCode(normalized);
    window.history.replaceState(null, "", `?room=${normalized}`);
  }

  function joinRoom() {
    if (!pendingCode) return;
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("join_room", {
        room_code: pendingCode,
        requested_nickname: nickname,
      });
      if (rpcError) throw rpcError;
      const snapshot = data as RoomSnapshot;
      roomCodeRef.current = snapshot.code;
      setRoom(snapshot);
      setPendingCode(null);
      localStorage.setItem(ROOM_STORAGE_KEY, snapshot.code);
    });
  }

  function prepareCamera() {
    if (!room) return;
    void run(async () => {
      await prepare();
      const { data, error: rpcError } = await supabase.rpc("set_camera_ready", { room_code: room.code });
      if (rpcError) throw rpcError;
      setRoom(data as RoomSnapshot);
    });
  }

  function startGame() {
    if (!room) return;
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("start_game", { room_code: room.code });
      if (rpcError) throw rpcError;
      setRoom(data as RoomSnapshot);
    });
  }

  async function shareRoom() {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "LikeMEME", url });
      else { await navigator.clipboard.writeText(url); setError("초대 링크를 복사했습니다."); }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError("초대 링크를 공유하지 못했습니다.");
    }
  }

  function returnToMain() {
    snapshotRequestSequenceRef.current += 1;
    roomCodeRef.current = null;
    activeRoundIdRef.current = null;
    scheduledRoundRef.current = null;
    judgingRequestRef.current = null;
    preparedForNextRef.current = null;
    resetCamera();
    localStorage.removeItem(ROOM_STORAGE_KEY);

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    setRoom(null);
    setPendingCode(null);
    setCodeInput("");
    setNickname("");
    setBusy(false);
    setError(null);
    setUploadState("idle");
    setUploadError(null);
    setShowCodeEntry(false);
    setShowCreateProgress(false);
    setOnboardingStarted(false);
  }

  if (!ready) return <main className="shell"><div className="card"><p>연결 중…</p></div></main>;
  if (!authReady) return <main className="shell"><section className="card"><h1>연결할 수 없습니다</h1><p className="muted">Anonymous Sign-In과 환경변수를 확인해 주세요.</p>{error && <p className="error">{error}</p>}</section></main>;

  if (room?.status === "finished") {
    return <FinalResultView results={room.final_results} players={room.players} finalRound={room.round} onReturnToMain={returnToMain} />;
  }

  if (room?.status === "playing" && room.round && ["complete", "invalid"].includes(room.round.status)) {
    return <RoundResultView key={room.round.id} round={room.round} players={room.players} roundWins={roundWins} videoRef={videoRef} cameraError={cameraError ?? error} />;
  }

  if (room?.status === "playing" && room.round) {
    const currentRoundNumber = room.round.number;
    const showCaptureScreen = ["countdown", "capturing", "complete", "error"].includes(cameraPhase) || ownSubmitted || room.round.status === "judging";
    const showNextRound = currentRoundNumber > 1 && room.round.status === "scheduled" && cameraPhase === "ready";
    const introReferenceVisible = cameraPhase === "observing";

    return <main className={`play-screen ${showNextRound ? "next-round-screen" : showCaptureScreen ? "camera-capture-screen" : "round-intro-screen"}`}>
      {showNextRound ? <>
        <header className="next-round-header">
          <img src="/brand/likememe-logo.png" alt="LikeMEME" />
          <strong>STAGE BREAK</strong>
        </header>
        <section className="next-round-content" aria-labelledby="next-round-title">
          <img className="next-round-logo" src="/brand/likememe-logo.png" alt="" />
          <p className="next-round-label">NEXT&nbsp;&nbsp; ROUND</p>
          <h1 id="next-round-title">{String(currentRoundNumber).padStart(2, "0")}</h1>
          <p className="next-round-primary-copy">새로운 밈이 곧 공개됩니다</p>
          <p className="next-round-secondary-copy">표정 · 포즈 · 스타일을 준비하세요</p>
          <ol className="next-round-progress" aria-label={`전체 5라운드 중 다음 라운드 ${currentRoundNumber}`}>
            {Array.from({ length: 5 }, (_, index) => {
              const number = index + 1;
              const active = number === currentRoundNumber;
              return <li className={active ? "is-active" : ""} aria-current={active ? "step" : undefined} key={number}>
                <img src={`/brand/next-round-dot${active ? "-active" : ""}.svg`} alt="" />
              </li>;
            })}
          </ol>
        </section>
      </> : !showCaptureScreen ? <>
        <img className="play-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
        <h1 className="round-intro-title">ROUND {room.round.number}</h1>
        <p className="round-intro-guide">잠시후 라운드가 시작됩니다.<br />아래 사진을 완벽하게 따라해 엔딩 요정을 거머쥐세요!</p>
        <img
          className={`round-intro-reference ${introReferenceVisible ? "" : "reference-hidden"}`}
          src={room.round.reference_image_path}
          alt={`Round ${room.round.number} 따라하기 기준 짤`}
        />
        <div className="round-intro-countdown" aria-live="polite">
          <strong>{cameraSeconds || 3}</strong><span>초 후 시작</span>
        </div>
      </> : <>
        <header className="capture-header">
          <img className="play-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
          <h1>ROUND {String(room.round.number).padStart(2, "0")}</h1>
        </header>
        <img className="capture-reference" src={room.round.reference_image_path} alt={`Round ${room.round.number} 따라하기 기준 짤`} />
        <p className="capture-time-label">제한 시간</p>
        <strong className="capture-countdown" aria-live="polite">{cameraPhase === "countdown" ? cameraSeconds : 0}</strong>
      </>}
      <div className={`capture-camera camera-frame ${showCaptureScreen ? "" : "is-parked"}`}>
        <video ref={videoRef} autoPlay muted playsInline className={capture ? "hidden" : "camera-video"} />
        {capture && <img src={capture.url} alt="자동 촬영된 내 사진" className="camera-video" />}
      </div>
      {(showCaptureScreen || cameraError || error) && <div className="play-feedback">
        {cameraError && <p className="error">{cameraError}</p>}
        {showCaptureScreen && <>
          {(cameraPhase === "idle" || cameraPhase === "error") && !capture && !ownSubmitted && <button className="primary" onClick={() => void retryCapture()}>촬영 오류 재시도</button>}
          {uploadState === "uploading" && <p>사진 업로드 중…</p>}
          {uploadState === "error" && <><p className="error">{uploadError}</p><button className="primary" onClick={() => void submitCapture()}>같은 사진 다시 업로드</button></>}
          {(uploadState === "submitted" || ownSubmitted) && room.round.status === "scheduled" && <p>제출 완료 · 다른 플레이어를 기다리는 중… ({room.round.submitted_player_ids.length}/{room.players.length})</p>}
          {room.round.status === "judging" && <p>Gemini AI 판정 중…</p>}
        </>}
        {error && <p className="error">{error}</p>}
      </div>}
      {!showNextRound && <PlayerStatusBar players={room.players} roundWins={roundWins} />}
    </main>;
  }

  if (room) {
    const allReady = room.players.length >= 2 && room.players.every((player) => player.camera_ready);
    const canStart = room.is_host && allReady && !busy;
    const me = room.players.find((player) => player.id === room.current_player_id);
    const playerSlots = Array.from({ length: 4 }, (_, index) =>
      room.players.find((player) => player.seat === index + 1),
    );
    const displayRoomCode = room.code.replace(/^(\d{3})(\d{3})$/, "$1 $2");

    return <main className="waiting-room-screen">
      <header className="waiting-room-header">
        <img className="waiting-room-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
        <span className="waiting-room-code" aria-label={`초대 코드 ${room.code}`}>
          {displayRoomCode}
        </span>
        <button className="waiting-room-share" type="button" onClick={() => void shareRoom()}>
          <span>링크로 공유하기</span>
        </button>
      </header>

      <div className="waiting-room-camera camera-frame">
        <video ref={videoRef} autoPlay muted playsInline className="camera-video" />
        {!me?.camera_ready && (
          <button className="waiting-room-camera-action" type="button" disabled={busy} onClick={prepareCamera}>
            {busy ? "카메라 준비 중…" : "카메라 준비"}
          </button>
        )}
      </div>

      <section className="waiting-room-players" aria-labelledby="waiting-room-player-title">
        <div className="waiting-room-player-heading">
          <h1 id="waiting-room-player-title">플레이어</h1>
          <span>{room.players.length} / 4</span>
        </div>
        <ul className="waiting-room-player-list">
          {playerSlots.map((player, index) => (
            <li className={player ? "is-filled" : "is-empty"} key={player?.id ?? `empty-${index + 1}`}>
              {player && <>
                <span className="waiting-room-avatar" style={{ background: seatColors[player.seat - 1] }}>
                  {player.nickname.slice(0, 1).toUpperCase()}
                </span>
                <span className="waiting-room-nickname">{player.nickname}</span>
                {player.is_host && <span className="waiting-room-host">HOST</span>}
                <span className={`waiting-room-ready ${player.camera_ready ? "is-ready" : "is-waiting"}`}>
                  {player.camera_ready ? "준비 완료" : "준비중"}
                </span>
              </>}
            </li>
          ))}
        </ul>
      </section>

      <div className="waiting-room-start">
        {room.is_host ? (
          <OnboardingAction variant="primary" disabled={!canStart} onClick={startGame}>
            {busy ? "시작 중…" : "게임 시작하기"}
          </OnboardingAction>
        ) : (
          <p className="waiting-room-host-wait">호스트가 게임을 시작하기를 기다리는 중…</p>
        )}
        {room.is_host && !allReady && <p className="waiting-room-start-hint">2명 이상 입장하고 모두 카메라를 준비해야 합니다.</p>}
      </div>

      {(cameraError || error) && <div className="waiting-room-errors">
        {cameraError && <p className="error">{cameraError}</p>}
        {error && <p className="error">{error}</p>}
      </div>}
      <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
    </main>;
  }

  if (pendingCode) return <main className="onboarding onboarding-room-screen">
    <img className="onboarding-logo onboarding-room-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
    <section className="onboarding-room-card" aria-labelledby="nickname-prompt">
      <label id="nickname-prompt" htmlFor="nickname">닉네임을 입력해주세요.</label>
      <input id="nickname" className="onboarding-room-input" value={nickname} maxLength={20} autoFocus onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") joinRoom(); }} />
    </section>
    <div className="onboarding-room-actions">
      <OnboardingAction variant="primary" disabled={busy || !nickname.trim()} onClick={joinRoom}>{busy ? "입장 중…" : "입장하기"}</OnboardingAction>
      <OnboardingAction variant="secondary" onClick={() => setPendingCode(null)}>이전으로</OnboardingAction>
      {error && <p className="onboarding-error">{error}</p>}
    </div>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;

  if (!onboardingStarted) return <main className="onboarding onboarding-initial">
    <img className="onboarding-bokeh" src="/brand/onboarding-bokeh.svg" alt="" />
    <button className="onboarding-start-surface" type="button" onClick={() => setOnboardingStarted(true)}>
      <img className="onboarding-logo onboarding-logo-large" src="/brand/likememe-logo.png" alt="LikeMEME" />
      <span className="onboarding-tagline">AI가 판정하는 실시간 밈 싱크로율 배틀</span>
      <span className="onboarding-start-copy">시작하려면 클릭하세요.</span>
    </button>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;

  if (showCreateProgress) return <main className="onboarding onboarding-room-screen">
    <img className="onboarding-logo onboarding-room-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
    <div className="onboarding-create-progress" role="status" aria-live="polite">
      <span aria-hidden="true">✦</span>
      <p>방 만드는 중 . . .</p>
    </div>
    <div className="onboarding-room-actions onboarding-room-actions-single">
      <OnboardingAction variant="secondary" onClick={() => {
        createRequestSequenceRef.current += 1;
        setShowCreateProgress(false);
      }}>이전으로</OnboardingAction>
    </div>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;

  if (showCodeEntry) return <main className="onboarding onboarding-room-screen">
    <img className="onboarding-logo onboarding-room-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
    <section className="onboarding-room-card" aria-labelledby="room-code-prompt">
      <label id="room-code-prompt" htmlFor="room-code">초대 코드를 입력해주세요.</label>
      <input id="room-code" className="onboarding-room-input onboarding-room-code-input" inputMode="numeric" maxLength={6} value={codeInput} autoFocus onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") chooseRoom(); }} />
    </section>
    <div className="onboarding-room-actions">
      <OnboardingAction variant="primary" onClick={chooseRoom}>다음으로</OnboardingAction>
      <OnboardingAction variant="secondary" onClick={() => setShowCodeEntry(false)}>이전으로</OnboardingAction>
      {error && <p className="onboarding-error">{error}</p>}
    </div>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;

  return <main className="onboarding onboarding-room-screen onboarding-menu">
    <img className="onboarding-logo onboarding-room-logo" src="/brand/likememe-logo.png" alt="LikeMEME" />
    <section className="onboarding-rules" aria-labelledby="how-to-play-title">
      <h1 id="how-to-play-title">How to Play</h1>
      <div className="onboarding-rule-list">
        <p>총 5라운드. 플레이 인원 2명~4명.</p>
        <p>카메라를 허용해주세요.</p>
        <p>짤을 가장 잘 따라한 사람이 승리!</p>
      </div>
    </section>
    <div className="onboarding-actions">
      <OnboardingAction variant="primary" disabled={busy} onClick={createRoom}>{busy ? "생성 중…" : "새 방 만들기"}</OnboardingAction>
      <OnboardingAction variant="secondary" onClick={() => setShowCodeEntry(true)}>코드로 입장하기</OnboardingAction>
      {error && <p className="onboarding-error">{error}</p>}
    </div>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;
}
