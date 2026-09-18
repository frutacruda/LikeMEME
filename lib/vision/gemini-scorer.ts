import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { ParticipantImage, VisionImage, VisionScorer, VisionScore } from "./scoring";
import { validateScores } from "./scoring";

const MODEL = "gemini-3.6-flash";
const GEMINI_ATTEMPT_TIMEOUT_MS = 20_000;

const SYSTEM_INSTRUCTION = `You are a strict image-similarity judge for a meme imitation game.
Compare every participant image only with visual elements actually visible in the reference image.

Score each category as an integer from 0 through 10:
- expression: eyes, eyebrows, mouth shape, emotional intensity, and face direction.
- pose: body direction, arms, legs, hands, tilt, silhouette, and placement within the frame.
- style: hairstyle, hair color, clothing type/color/pattern, accessories, and props.

Use these bands consistently: 0-2 almost entirely different; 3-4 only some features similar; 5-6 core characteristics similar but details differ; 7-8 most major characteristics similar; 9-10 highly similar including details.

Do not evaluate attractiveness, gender, age, body type, skin color, clothing price, camera quality, or background aesthetics. If a reference element is visible but absent due to participant framing, treat it as not reproduced. Apply identical standards to all participants. Return only the requested JSON fields and never include explanations, comments, totals, rankings, or any other text.`;

function inlineImage(image: VisionImage) {
  return {
    inlineData: {
      data: Buffer.from(image.bytes).toString("base64"),
      mimeType: image.mimeType,
    },
  };
}

export class GeminiVisionScorer implements VisionScorer {
  private readonly client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    this.client = new GoogleGenAI({ apiKey });
  }

  async score(reference: VisionImage, participants: ParticipantImage[]): Promise<VisionScore> {
    const ids = participants.map(({ id }) => id);
    const response = await this.client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: "REFERENCE IMAGE (the only scoring target):" },
            inlineImage(reference),
            ...participants.flatMap(({ id, image }) => [
              { text: `PARTICIPANT ${id}:` },
              inlineImage(image),
            ]),
            { text: `Score exactly these participant IDs once each: ${ids.join(", ")}.` },
          ],
        },
      ],
      config: {
        abortSignal: AbortSignal.timeout(GEMINI_ATTEMPT_TIMEOUT_MS),
        httpOptions: {
          timeout: GEMINI_ATTEMPT_TIMEOUT_MS,
          retryOptions: { attempts: 1 },
        },
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["participants"],
          properties: {
            participants: {
              type: "array",
              minItems: participants.length,
              maxItems: participants.length,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "expression", "pose", "style"],
                properties: {
                  id: { type: "string", enum: ids },
                  expression: { type: "integer", minimum: 0, maximum: 10 },
                  pose: { type: "integer", minimum: 0, maximum: 10 },
                  style: { type: "integer", minimum: 0, maximum: 10 },
                },
              },
            },
          },
        },
      },
    });

    if (!response.text) throw new Error("Gemini returned an empty response.");
    return validateScores(JSON.parse(response.text), ids);
  }
}
