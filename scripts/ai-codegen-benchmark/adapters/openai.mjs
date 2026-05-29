/**
 * OpenAI Chat Completions adapter — covers GPT-4o family and Cursor's
 * underlying model selections.
 */
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

export default async function openaiAdapter(promptText, { library }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior Angular engineer. Output ONLY TypeScript source — no prose, no markdown fences. Use the library named in the prompt.',
        },
        { role: 'user', content: promptText },
      ],
      max_tokens: 2048,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const code = body.choices?.[0]?.message?.content ?? '';
  return { code: stripFences(code), model: body.model ?? MODEL, library };
}

function stripFences(c) {
  return c.replace(/^```(?:typescript|ts)?\n?/gm, '').replace(/\n?```$/gm, '').trim();
}
