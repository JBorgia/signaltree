/**
 * Claude (Anthropic Messages API) adapter.
 *
 * Returns { code: string, model: string } given a prompt + library context.
 * Strips markdown fences so downstream tooling gets raw TypeScript.
 */
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-4-7';

export default async function claudeAdapter(promptText, { library }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set — cannot invoke claude adapter.');
  }

  const systemPrompt =
    'You are a senior Angular engineer. When asked to write code, output ONLY the ' +
    'TypeScript source — no prose, no markdown fences, no explanations. ' +
    'Use the library named in the prompt; do not substitute.';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: promptText }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const code = body.content?.[0]?.text ?? '';
  return {
    code: stripFences(code),
    model: body.model ?? MODEL,
    library,
  };
}

function stripFences(code) {
  return code
    .replace(/^```(?:typescript|ts)?\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}
