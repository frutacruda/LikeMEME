"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RoomSnapshot } from "@/lib/supabase/types";

const ROOM_STORAGE_KEY = "followme.room-code";
const seatColors = ["#FF6B6B", "#4DABF7", "#51CF66", "#FFD43B"];

function messageFrom(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "요청을 처리하지 못했습니다.";
}

export default function MultiplayerPoc() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [ready, setReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomCodeRef = useRef<string | null>(null);

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
    const { data, error: rpcError } = await supabase.rpc("get_room_snapshot", {
      room_code: roomCode,
    });
    if (rpcError) throw rpcError;
    const snapshot = data as RoomSnapshot;
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
          try {
            await loadSnapshot(initialCode);
          } catch {
            if (active) setPendingCode(initialCode);
          }
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
      const roomCode = roomCodeRef.current;
      if (roomCode) void loadSnapshot(roomCode).catch((refreshError) => {
        setError(messageFrom(refreshError));
      });
    };

    const channel = supabase
      .channel(`room:${room.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}`,
      }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot, room?.id, supabase]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await ensureAuthenticated();
      await action();
    } catch (actionError) { setError(messageFrom(actionError)); }
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
    if (normalized.length !== 6) {
      setError("6자리 방 코드를 입력해 주세요.");
      return;
    }
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

  function startGame() {
    if (!room) return;
    void run(async () => {
      const { data, error: rpcError } = await supabase.rpc("start_game", {
        room_code: room.code,
      });
      if (rpcError) throw rpcError;
      setRoom(data as RoomSnapshot);
    });
  }

  async function shareRoom() {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "FollowMe", text: `방 코드 ${room.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setError("초대 링크를 복사했습니다.");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setError("초대 링크를 공유하지 못했습니다.");
    }
  }

  if (!ready) return <main className="shell"><div className="card"><p>연결 중…</p></div></main>;

  if (!authReady) {
    return (
      <main className="shell">
        <section className="card">
          <span className="eyebrow">SUPABASE AUTH</span>
          <h1>연결할 수 없습니다</h1>
          <p className="muted">Anonymous Sign-In 설정과 현재 프로젝트 환경변수를 확인해 주세요.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="secondary" onClick={() => window.location.reload()}>다시 시도</button>
        </section>
      </main>
    );
  }

  if (room?.status === "playing") {
    return (
      <main className="shell">
        <section className="card game-card">
          <span className="eyebrow">ROOM {room.code}</span>
          <div className="game-icon">✓</div>
          <h1>Game started</h1>
          <p className="muted">ROUND 1 · 모든 플레이어가 같은 상태를 확인했습니다.</p>
        </section>
      </main>
    );
  }

  if (room) {
    const canStart = room.is_host && room.players.length >= 2 && !busy;
    return (
      <main className="shell">
        <section className="card">
          <span className="eyebrow">WAITING ROOM</span>
          <h1 className="room-code">{room.code}</h1>
          <p className="muted">이 코드를 친구에게 알려주세요.</p>
          <button className="secondary" onClick={() => void shareRoom()}>초대 링크 공유</button>
          <div className="divider" />
          <div className="player-heading"><h2>플레이어</h2><span>{room.players.length}/4</span></div>
          <ul className="players">
            {room.players.map((player) => (
              <li key={player.id}>
                <span className="avatar" style={{ background: seatColors[player.seat - 1] }}>{player.nickname.slice(0, 1).toUpperCase()}</span>
                <span>{player.nickname}</span>
                {player.is_host && <span className="host-badge">HOST</span>}
              </li>
            ))}
          </ul>
          {room.is_host ? (
            <>
              <button className="primary" disabled={!canStart} onClick={startGame}>게임 시작</button>
              {room.players.length < 2 && <p className="hint">한 명 이상의 친구를 기다리고 있어요.</p>}
            </>
          ) : <p className="waiting-copy">호스트가 게임을 시작하기를 기다리는 중…</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  if (pendingCode) {
    return (
      <main className="shell">
        <section className="card">
          <button className="back" onClick={() => setPendingCode(null)}>← 뒤로</button>
          <span className="eyebrow">ROOM {pendingCode}</span>
          <h1>닉네임 입력</h1>
          <p className="muted">방 안에서 사용할 이름을 정해 주세요.</p>
          <input className="text-input" value={nickname} maxLength={20} autoFocus placeholder="1–20자" onChange={(event) => setNickname(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") joinRoom(); }} />
          <button className="primary" disabled={busy || !nickname.trim()} onClick={joinRoom}>{busy ? "입장 중…" : "방 입장"}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="card hero">
        <span className="eyebrow">REALTIME MULTIPLAYER POC</span>
        <h1>FollowMe</h1>
        <p className="muted">친구들과 같은 표정, 같은 순간.</p>
        <button className="primary" disabled={busy} onClick={createRoom}>{busy ? "생성 중…" : "새 방 만들기"}</button>
        <div className="or"><span>또는</span></div>
        <label className="field-label" htmlFor="room-code">방 코드로 입장</label>
        <div className="join-row">
          <input id="room-code" className="code-input" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={codeInput} placeholder="000000" onChange={(event) => setCodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(event) => { if (event.key === "Enter") chooseRoom(); }} />
          <button className="secondary compact" onClick={chooseRoom}>입장</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
