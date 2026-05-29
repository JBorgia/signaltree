/**
 * OpenRouter adapter — one API key, every major model.
 *
 * OpenRouter exposes an OpenAI-Chat-Completions-compatible endpoint that
 * proxies to Anthropic, OpenAI, Google, Perplexity, Meta, Mistral, etc.
 * Switching agents is just a model-string change. This is significantly
 * cleaner than maintaining a separate adapter per provider.
 *
 * Required env: OPENROUTER_API_KEY.
 *
 * Optional env per model alias:
 *   OPENROUTER_CLAUDE_MODEL     (default: anthropic/claude-3.5-sonnet)
 *   OPENROUTER_OPENAI_MODEL     (default: openai/gpt-4o)
 *   OPENROUTER_GEMINI_MODEL     (default: google/gemini-pro-1.5)
 *   OPENROUTER_PERPLEXITY_MODEL (default: perplexity/llama-3.1-sonar-large-128k-chat)
 *   OPENROUTER_LLAMA_MODEL      (default: meta-llama/llama-3.1-70b-instruct)
 *   OPENROUTER_DEFAULT_MODEL    (default: anthropic/claude-3.5-sonnet)
 */

const ALIAS_TO_MODEL = {
  claude: process.env.OPENROUTER_CLAUDE_MODEL ?? 'anthropic/claude-sonnet-4.6',
  openai: process.env.OPENROUTER_OPENAI_MODEL ?? 'openai/gpt-5.4',
  gemini: process.env.OPENROUTER_GEMINI_MODEL ?? 'google/gemini-3.1-pro-preview',
  perplexity:
    process.env.OPENROUTER_PERPLEXITY_MODEL ?? 'perplexity/sonar-pro-search',
  llama: process.env.OPENROUTER_LLAMA_MODEL ?? 'meta-llama/llama-3.1-70b-instruct',
  // Per-tier comparison: same provider, smaller/faster model. Used to test
  // whether the priming lift holds at lower model tiers (e.g. for users on
  // Cursor's "Cheap" model).
  haiku: process.env.OPENROUTER_HAIKU_MODEL ?? 'anthropic/claude-haiku-4.5',
  'gpt-mini': process.env.OPENROUTER_GPT_MINI_MODEL ?? 'openai/gpt-5.4-mini',
};

const DEFAULT_MODEL =
  process.env.OPENROUTER_DEFAULT_MODEL ?? ALIAS_TO_MODEL.claude;

/**
 * Resolve an agent name to an OpenRouter model slug.
 * The benchmark runner passes adapters known agent names (claude, openai,
 * gemini, perplexity); we map each to the user's preferred OR slug.
 */
function resolveModel(agentAlias) {
  if (!agentAlias) return DEFAULT_MODEL;
  if (ALIAS_TO_MODEL[agentAlias]) return ALIAS_TO_MODEL[agentAlias];
  // If the alias already looks like a slug (contains '/'), trust it.
  if (agentAlias.includes('/')) return agentAlias;
  return DEFAULT_MODEL;
}

export default async function openrouterAdapter(
  promptText,
  { library, agent } = {}
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY not set — get one at https://openrouter.ai/keys'
    );
  }

  const model = resolveModel(agent);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter attribution headers (optional but recommended).
      'HTTP-Referer': 'https://signaltree.io/built-for-ai',
      'X-Title': 'SignalTree AI-codegen benchmark',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a senior Angular engineer. Output ONLY the TypeScript source — ' +
            'no prose, no markdown fences, no explanations. Use the library named in ' +
            'the prompt; do not substitute.',
        },
        // Optional retrieval-priming context. Set PRIMING_CONTEXT_FILE to a file
        // path (e.g. apps/demo/public/llms.txt) to inject its contents as an
        // additional system message. This measures the AI-discoverability surface.
        ...(globalThis.__primingContextCache
          ? [{ role: 'system', content: globalThis.__primingContextCache }]
          : []),
        { role: 'user', content: promptText },
      ],
      temperature: 0,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const code = body.choices?.[0]?.message?.content ?? '';
  return {
    code: stripFences(code),
    model: body.model ?? model,
    library,
    via: 'openrouter',
  };
}

function stripFences(c) {
  return c
    .replace(/^```(?:typescript|ts)?\n?/gm, '')
    .replace(/\n?```$/gm, '')
    .trim();
}
