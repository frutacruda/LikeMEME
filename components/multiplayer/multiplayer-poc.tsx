"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function RoundResultView({
  round,
  players,
  videoRef,
  cameraError,
}: {
  round: RoundSnapshot;
  players: RoomPlayer[];
  videoRef: (node: HTMLVideoElement | null) => void;
  cameraError: string | null;
}) {
  const [revealStep, setRevealStep] = useState(round.status === "invalid" ? 4 : 1);

  useEffect(() => {
    if (round.status !== "complete") return;
    const timers = [
      window.setTimeout(() => setRevealStep(2), 700),
      window.setTimeout(() => setRevealStep(3), 1400),
      window.setTimeout(() => setRevealStep(4), 2100),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [round.status]);

  const winners = round.scores
    .filter((score) => score.is_winner)
    .map((score) => players.find((player) => player.id === score.player_id)?.nickname)
    .filter(Boolean);

  return (
    <main className="shell">
      <section className="card result-card">
        <span className="eyebrow">ROUND {round.number} RESULT · {round.number}/5</span>
        <h1>{round.status === "invalid" ? "라운드 무효" : "라운드 결과"}</h1>
        {round.status === "invalid" ? (
          <p className="error">AI 판정에 실패했습니다. 승리와 점수 없이 다음 라운드로 진행합니다.</p>
        ) : (
          <>
            <div className="score-table">
              {round.scores.map((score) => {
                const player = players.find((item) => item.id === score.player_id);
                return (
                  <div className={`score-row ${revealStep >= 4 && score.is_winner ? "winner" : ""}`} key={score.player_id}>
                    <strong>{player?.nickname}</strong>
                    <span>표정 {score.expression * 10}%</span>
                    <span>{revealStep >= 2 ? `포즈 ${score.pose * 10}%` : "포즈 ···"}</span>
                    <span>{revealStep >= 3 ? `스타일 ${score.style * 10}%` : "스타일 ···"}</span>
                    <b>{revealStep >= 4 ? `${Math.round(score.total / 30 * 100)}%` : "···"}</b>
                  </div>
                );
              })}
            </div>
            {revealStep >= 4 && <p className="winner-copy">Round {round.number} Winner: {winners.join(" · ")}</p>}
          </>
        )}
        {round.number < 5 && (
          <>
            <p className="waiting-copy">다음 라운드 카메라 준비 및 자동 진행 중…</p>
            <div className="camera-frame result-camera"><video ref={videoRef} autoPlay muted playsInline className="camera-video" /></div>
            {cameraError && <p className="error">{cameraError}</p>}
          </>
        )}
        {round.number === 5 && <p className="waiting-copy">최종 결과를 계산하는 중…</p>}
      </section>
    </main>
  );
}

function FinalResultView({
  results,
  players,
  onReturnToMain,
}: {
  results: FinalResult[];
  players: RoomPlayer[];
  onReturnToMain: () => void;
}) {
  return (
    <main className="shell">
      <section className="card result-card">
        <span className="eyebrow">GAME COMPLETE</span>
        <h1>최종 결과</h1>
        <div className="final-table">
          {results.map((result) => {
            const player = players.find((item) => item.id === result.player_id);
            return (
              <div className="final-row" key={result.player_id}>
                <b>{result.rank}위</b>
                <strong>{player?.nickname}</strong>
                <span>{result.round_wins}승</span>
                <span>누적 {result.cumulative_total}점</span>
              </div>
            );
          })}
        </div>
        <p className="muted">5라운드 게임이 종료되었습니다.</p>
        <button className="primary" type="button" onClick={onReturnToMain}>메인으로 돌아가기</button>
      </section>
    </main>
  );
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
  const roomCodeRef = useRef<string | null>(null);
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
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("create_room");
      if (rpcError) throw rpcError;
      const roomCode = String(data);
      setPendingCode(roomCode);
      window.history.replaceState(null, "", `?room=${roomCode}`);
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
      if (navigator.share) await navigator.share({ title: "LikeMEME", text: `방 코드 ${room.code}`, url });
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
    setOnboardingStarted(false);
  }

  if (!ready) return <main className="shell"><div className="card"><p>연결 중…</p></div></main>;
  if (!authReady) return <main className="shell"><section className="card"><h1>연결할 수 없습니다</h1><p className="muted">Anonymous Sign-In과 환경변수를 확인해 주세요.</p>{error && <p className="error">{error}</p>}</section></main>;

  if (room?.status === "finished") {
    return <FinalResultView results={room.final_results} players={room.players} onReturnToMain={returnToMain} />;
  }

  if (room?.status === "playing" && room.round && ["complete", "invalid"].includes(room.round.status)) {
    return <RoundResultView key={room.round.id} round={room.round} players={room.players} videoRef={videoRef} cameraError={cameraError ?? error} />;
  }

  if (room?.status === "playing" && room.round) {
    const referenceVisible = ["observing", "countdown", "capturing", "complete"].includes(cameraPhase);
    const labels = {
      idle: "카메라를 준비하는 중", requesting: "카메라 권한 확인 중", preparing: "카메라 준비 중", ready: `라운드 시작 대기 · ${cameraSeconds || ""}`,
      observing: `짤 관찰 · ${cameraSeconds}`, countdown: `${cameraSeconds}`, capturing: "촬영 중", complete: "촬영 완료", error: "촬영 오류",
    };
    return <main className="game-shell"><section className="round-card">
      <header><span className="eyebrow">ROUND {room.round.number} · {room.round.number}/5</span><h1>{labels[cameraPhase]}</h1></header>
      <div className="round-grid">
        <div><p className="panel-label">REFERENCE MEME</p><img className={`round-image ${referenceVisible ? "" : "reference-hidden"}`} src={room.round.reference_image_path} alt={`Round ${room.round.number} 따라하기 기준 짤`} /></div>
        <div><p className="panel-label">MY CAMERA</p><div className="camera-frame">
          <video ref={videoRef} autoPlay muted playsInline className={capture ? "hidden" : "camera-video"} />
          {capture && <img src={capture.url} alt="자동 촬영된 내 사진" className="camera-video" />}
          {cameraPhase === "countdown" && <span className="countdown">{cameraSeconds}</span>}
        </div></div>
      </div>
      {cameraError && <p className="error">{cameraError}</p>}
      {(cameraPhase === "idle" || cameraPhase === "error") && !capture && !ownSubmitted && <button className="primary" onClick={() => void retryCapture()}>촬영 오류 재시도</button>}
      {uploadState === "uploading" && <p className="waiting-copy">사진 업로드 중…</p>}
      {uploadState === "error" && <><p className="error">{uploadError}</p><button className="primary" onClick={() => void submitCapture()}>같은 사진 다시 업로드</button></>}
      {(uploadState === "submitted" || ownSubmitted) && room.round.status === "scheduled" && <p className="waiting-copy">제출 완료 · 다른 플레이어를 기다리는 중… ({room.round.submitted_player_ids.length}/{room.players.length})</p>}
      {room.round.status === "judging" && <p className="waiting-copy">Gemini AI 판정 중…</p>}
      {error && <p className="error">{error}</p>}
    </section></main>;
  }

  if (room) {
    const allReady = room.players.length >= 2 && room.players.every((player) => player.camera_ready);
    const canStart = room.is_host && allReady && !busy;
    const me = room.players.find((player) => player.id === room.current_player_id);
    return <main className="shell"><section className="card">
      <span className="eyebrow">WAITING ROOM</span><h1 className="room-code">{room.code}</h1>
      <button className="secondary" onClick={() => void shareRoom()}>초대 링크 공유</button><div className="divider" />
      <div className="player-heading"><h2>플레이어</h2><span>{room.players.length}/4</span></div>
      <ul className="players">{room.players.map((player) => <li key={player.id}><span className="avatar" style={{ background: seatColors[player.seat - 1] }}>{player.nickname.slice(0, 1).toUpperCase()}</span><span>{player.nickname}</span>{player.is_host && <span className="host-badge">HOST</span>}<span className="ready-badge">{player.camera_ready ? "READY" : "WAIT"}</span></li>)}</ul>
      <div className="camera-frame lobby-camera"><video ref={videoRef} autoPlay muted playsInline className="camera-video" /></div>
      {!me?.camera_ready && <button className="primary" disabled={busy} onClick={prepareCamera}>{busy ? "카메라 준비 중…" : "카메라 준비"}</button>}
      {me?.camera_ready && <p className="waiting-copy">내 카메라 준비 완료</p>}
      {room.is_host ? <><button className="primary" disabled={!canStart} onClick={startGame}>게임 시작</button>{!allReady && <p className="hint">2명 이상 입장하고 모두 카메라를 준비해야 합니다.</p>}</> : <p className="waiting-copy">호스트가 게임을 시작하기를 기다리는 중…</p>}
      {cameraError && <p className="error">{cameraError}</p>}{error && <p className="error">{error}</p>}
    </section></main>;
  }

  if (pendingCode) return <main className="shell"><section className="card"><button className="back" onClick={() => setPendingCode(null)}>← 뒤로</button><span className="eyebrow">ROOM {pendingCode}</span><h1>닉네임 입력</h1><input className="text-input" value={nickname} maxLength={20} autoFocus placeholder="1–20자" onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") joinRoom(); }} /><button className="primary" disabled={busy || !nickname.trim()} onClick={joinRoom}>{busy ? "입장 중…" : "방 입장"}</button>{error && <p className="error">{error}</p>}</section></main>;

  if (!onboardingStarted) return <main className="onboarding onboarding-initial">
    <img className="onboarding-bokeh" src="/brand/onboarding-bokeh.svg" alt="" />
    <button className="onboarding-start-surface" type="button" onClick={() => setOnboardingStarted(true)}>
      <img className="onboarding-logo onboarding-logo-large" src="/brand/likememe-logo.png" alt="LikeMEME" />
      <span className="onboarding-tagline">AI가 판정하는 실시간 밈 싱크로율 배틀</span>
      <span className="onboarding-start-copy">시작하려면 클릭하세요.</span>
    </button>
    <button className="onboarding-help onboarding-help-cyan" type="button" aria-label="도움말">?</button>
  </main>;

  return <main className="onboarding onboarding-menu">
    <img className="onboarding-logo onboarding-logo-small" src="/brand/likememe-logo.png" alt="LikeMEME" />
    <section className="onboarding-rules" aria-labelledby="how-to-play-title">
      <h1 id="how-to-play-title">How to Play</h1>
      <div className="onboarding-rule-list">
        <p>총 5라운드. 플레이 인원 2명~4명.</p>
        <p>카메라를 허용해주세요.</p>
        <p>짤을 가장 잘 따라한 사람이 승리!</p>
      </div>
    </section>
    <div className="onboarding-actions">
      <button className="onboarding-action onboarding-action-primary" type="button" disabled={busy} onClick={createRoom}>{busy ? "생성 중…" : "새 방 만들기"}</button>
      <button className="onboarding-action onboarding-action-secondary" type="button" onClick={() => setShowCodeEntry((visible) => !visible)}>코드로 입장하기</button>
      {showCodeEntry && <div className="onboarding-code-entry">
        <label htmlFor="room-code">6자리 방 코드</label>
        <div className="join-row">
          <input id="room-code" className="code-input" inputMode="numeric" maxLength={6} value={codeInput} placeholder="000000" autoFocus onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") chooseRoom(); }} />
          <button className="onboarding-code-submit" type="button" onClick={chooseRoom}>입장</button>
        </div>
      </div>}
      {error && <p className="onboarding-error">{error}</p>}
    </div>
    <button className="onboarding-help onboarding-help-pink" type="button" aria-label="도움말">?</button>
  </main>;
}
