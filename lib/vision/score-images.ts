import "server-only";

import { GeminiVisionScorer } from "./gemini-scorer";
import type { ParticipantImage, VisionImage, VisionScore, VisionScorer } from "./scoring";

const ATTEMPT_TIMEOUT_MS = 20_000;

export type ScoreAttemptEvent = {
  attempt: 1 | 2;
  elapsedMs: number;
  outcome: "success" | "failure";
  error?: unknown;
};

type ScoreImagesOptions = {
  onAttemptComplete?: (event: ScoreAttemptEvent) => void;
};

class VisionAttemptTimeoutError extends Error {
  constructor() {
    super(`Vision scoring attempt exceeded ${ATTEMPT_TIMEOUT_MS}ms.`);
    this.name = "VisionAttemptTimeoutError";
  }
}

async function withAttemptTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new VisionAttemptTimeoutError()), ATTEMPT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const target = Math.floor(random * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export async function scoreImages(
  reference: VisionImage,
  participants: ParticipantImage[],
  scorer: VisionScorer = new GeminiVisionScorer(),
  options: ScoreImagesOptions = {},
): Promise<VisionScore> {
  const randomized = shuffled(participants);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const result = await withAttemptTimeout(scorer.score(reference, randomized));
      options.onAttemptComplete?.({
        attempt: (attempt + 1) as 1 | 2,
        elapsedMs: Math.round(performance.now() - startedAt),
        outcome: "success",
      });
      return {
        participants: [...result.participants].sort(
          (a, b) => participants.findIndex(({ id }) => id === a.id) - participants.findIndex(({ id }) => id === b.id),
        ),
      };
    } catch (error) {
      options.onAttemptComplete?.({
        attempt: (attempt + 1) as 1 | 2,
        elapsedMs: Math.round(performance.now() - startedAt),
        outcome: "failure",
        error,
      });
      lastError = error;
    }
  }

  if (lastError !== undefined) throw lastError;
  throw new Error("Vision scoring failed twice.");
}
