/**
 * Perplexity adapter — Chat Completions-compatible API.
 */
const MODEL = process.env.PERPLEXITY_MODEL ?? 'llama-3.1-sonar-large-128k-chat';

export default async function perplexityAdapter(promptText, { library }) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set');

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior Angular engineer. Output ONLY TypeScript — no prose, no markdown fences. Use the library named in the prompt.',
        },
        { role: 'user', content: promptText },
      ],
      temperature: 0,
      max_tokens: 2048,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const code = body.choices?.[0]?.message?.content ?? '';
  return { code: stripFences(code), model: body.model ?? MODEL, library };
}

function stripFences(c) {
  return c.replace(/^```(?:typescript|ts)?\n?/gm, '').replace(/\n?```$/gm, '').trim();
}
