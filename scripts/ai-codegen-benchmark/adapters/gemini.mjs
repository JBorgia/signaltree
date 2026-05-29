/**
 * Google Gemini adapter (AI Studio API).
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

export default async function geminiAdapter(promptText, { library }) {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY / GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      systemInstruction: {
        parts: [
          {
            text:
              'You are a senior Angular engineer. Output ONLY TypeScript — no prose, no markdown fences. Use the library named in the prompt.',
          },
        ],
      },
      generationConfig: { temperature: 0, maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const code = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return { code: stripFences(code), model: MODEL, library };
}

function stripFences(c) {
  return c.replace(/^```(?:typescript|ts)?\n?/gm, '').replace(/\n?```$/gm, '').trim();
}
