import "server-only";

import { GeminiVisionScorer } from "./gemini-scorer";
import type { ParticipantImage, VisionImage, VisionScore, VisionScorer } from "./scoring";

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
): Promise<VisionScore> {
  const randomized = shuffled(participants);
  let firstError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await scorer.score(reference, randomized);
      return {
        participants: [...result.participants].sort(
          (a, b) => participants.findIndex(({ id }) => id === a.id) - participants.findIndex(({ id }) => id === b.id),
        ),
      };
    } catch (error) {
      if (attempt === 0) firstError = error;
    }
  }

  throw firstError instanceof Error ? firstError : new Error("Vision scoring failed twice.");
}
