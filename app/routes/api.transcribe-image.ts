import type { Route } from "./+types/api.transcribe-image";
import { getOpenAIClient } from "~/lib/openai.server";

/**
 * POST /api/transcribe-image
 *
 * Accepts a JSON body: { imageBase64: string, mimeType: string }
 * Uses GPT-4o Vision to transcribe Hebrew handwriting / printed text from the image.
 * Returns: { ok: true, text: string } | { ok: false, error: string }
 */
export async function action({ request }: Route.ActionArgs) {
  try {
    const { imageBase64, mimeType } = (await request.json()) as {
      imageBase64: string;
      mimeType: string;
    };

    if (!imageBase64 || !mimeType) {
      return Response.json({ ok: false, error: "Missing imageBase64 or mimeType" }, { status: 400 });
    }

    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `You are an expert transcription assistant for Hebrew academic notes.
Transcribe ALL text visible in this image to plain text.
- Preserve the original language (Hebrew or any other language found).
- Maintain paragraph structure and line breaks.
- If there are formulas, diagrams or tables, describe them briefly in [brackets].
- Output ONLY the transcribed text — no preamble, no explanation.`,
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const text = response.choices[0]?.message?.content ?? "";
    return Response.json({ ok: true, text });
  } catch (err: unknown) {
    console.error("[transcribe-image]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
