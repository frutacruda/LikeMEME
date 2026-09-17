import { NextResponse } from "next/server";
import { scoreImages } from "@/lib/vision/score-images";
import type { VisionImage } from "@/lib/vision/scoring";

export const runtime = "nodejs";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 45 * 1024 * 1024;

async function toVisionImage(value: FormDataEntryValue | null, label: string): Promise<VisionImage> {
  if (!(value instanceof File) || value.size === 0) throw new Error(`${label} image is required.`);
  if (!ACCEPTED_TYPES.has(value.type)) throw new Error(`${label} must be JPEG, PNG, or WebP.`);
  if (value.size > MAX_IMAGE_BYTES) throw new Error(`${label} must be 10 MB or smaller.`);

  return {
    bytes: new Uint8Array(await value.arrayBuffer()),
    mimeType: value.type as VisionImage["mimeType"],
  };
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "The image request must be 45 MB or smaller." }, { status: 413 });
    }

    const formData = await request.formData();
    const participantFiles = formData.getAll("participants");
    if (participantFiles.length < 1 || participantFiles.length > 4) {
      return NextResponse.json({ error: "Select between 1 and 4 participant images." }, { status: 400 });
    }

    const reference = await toVisionImage(formData.get("reference"), "Reference");
    const participants = await Promise.all(
      participantFiles.map(async (file, index) => ({
        id: `p${index + 1}`,
        image: await toVisionImage(file, `Participant ${index + 1}`),
      })),
    );

    const scores = await scoreImages(reference, participants);
    return NextResponse.json(scores);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vision scoring failed.";
    const isInputError = /required|must be|Select between/.test(message);
    console.error("Vision scoring request failed", { message });
    return NextResponse.json(
      { error: isInputError ? message : "AI scoring failed. Please try again." },
      { status: isInputError ? 400 : 502 },
    );
  }
}
