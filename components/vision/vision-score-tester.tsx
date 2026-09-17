"use client";

import { FormEvent, useState } from "react";
import { visionScoreSchema, type VisionScore } from "@/lib/vision/scoring";

export default function VisionScoreTester() {
  const [result, setResult] = useState<VisionScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/vision-score", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const apiError = typeof body === "object" && body && "error" in body ? body.error : null;
        throw new Error(typeof apiError === "string" ? apiError : "채점 요청에 실패했습니다.");
      }
      setResult(visionScoreSchema.parse(body));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "채점 결과를 확인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-400">Vision AI 기술 검증</p>
        <h2 className="mt-2 text-xl font-bold">이미지 유사도 채점</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">원본 1장과 참가자 사진 1–4장을 선택하세요. 이름 없이 임시 ID로만 채점합니다.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-semibold">
          원본 meme 이미지
          <input className="mt-2 block w-full rounded-lg border border-zinc-300 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800 dark:border-zinc-700 dark:file:bg-blue-950 dark:file:text-blue-200" type="file" name="reference" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <label className="block text-sm font-semibold">
          참가자 이미지 (최대 4장)
          <input className="mt-2 block w-full rounded-lg border border-zinc-300 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800 dark:border-zinc-700 dark:file:bg-blue-950 dark:file:text-blue-200" type="file" name="participants" accept="image/jpeg,image/png,image/webp" multiple required />
        </label>
        <button disabled={pending} className="min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" type="submit">
          {pending ? "Gemini가 채점 중…" : "AI 채점 실행"}
        </button>
      </form>

      {error && <p role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {result && (
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-900"><tr><th className="p-3">ID</th><th className="p-3">표정</th><th className="p-3">포즈</th><th className="p-3">스타일</th></tr></thead>
            <tbody>{result.participants.map((participant) => <tr className="border-t border-zinc-200 dark:border-zinc-800" key={participant.id}><td className="p-3 font-mono">{participant.id}</td><td className="p-3">{participant.expression}</td><td className="p-3">{participant.pose}</td><td className="p-3">{participant.style}</td></tr>)}</tbody>
          </table>
          <pre className="overflow-x-auto border-t border-zinc-200 bg-zinc-950 p-4 text-xs text-emerald-300 dark:border-zinc-800">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
