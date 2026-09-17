import { z } from "zod";

export const participantScoreSchema = z
  .object({
    id: z.string().regex(/^p[1-4]$/),
    expression: z.number().int().min(0).max(10),
    pose: z.number().int().min(0).max(10),
    style: z.number().int().min(0).max(10),
  })
  .strict();

export const visionScoreSchema = z
  .object({ participants: z.array(participantScoreSchema).min(1).max(4) })
  .strict();

export type VisionScore = z.infer<typeof visionScoreSchema>;

export type VisionImage = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ParticipantImage = {
  id: string;
  image: VisionImage;
};

export interface VisionScorer {
  score(reference: VisionImage, participants: ParticipantImage[]): Promise<VisionScore>;
}

export function validateScores(value: unknown, expectedIds: string[]): VisionScore {
  const result = visionScoreSchema.parse(value);
  const actualIds = result.participants.map(({ id }) => id);

  if (
    new Set(actualIds).size !== actualIds.length ||
    actualIds.length !== expectedIds.length ||
    [...actualIds].sort().join(",") !== [...expectedIds].sort().join(",")
  ) {
    throw new Error("AI response participant IDs did not match the request.");
  }

  return {
    participants: [...result.participants].sort(
      (a, b) => expectedIds.indexOf(a.id) - expectedIds.indexOf(b.id),
    ),
  };
}
