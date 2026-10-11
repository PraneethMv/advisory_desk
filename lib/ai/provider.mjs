// Local model access. Every AI feature calls models through a provider so the
// runtime (Ollama today) can change without touching workflows. The Ollama
// adapter only ever talks to a loopback address; there is no cloud fallback.

export const DEFAULT_AI_CONFIG = {
  baseUrl: 'http://127.0.0.1:11434',
  chatModel: 'gemma4:e4b',
  embedModel: 'embeddinggemma'
};

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class AIUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIUnavailableError';
    this.cause = cause;
  }
}

// Rejects anything that is not plain HTTP on this machine, so a misconfigured
// URL can never send prompts or documents elsewhere.
export function loopbackUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`AI runtime URL is invalid: ${value}`); }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`AI runtime must be a local address such as ${DEFAULT_AI_CONFIG.baseUrl}; refusing ${url.origin}`);
  }
  return url.origin;
}

// Ollama names models "name:tag"; an untagged name means ":latest".
const modelKey = name => (name.includes(':') ? name : `${name}:latest`);

export function createOllamaProvider(config = {}, fetchImpl = globalThis.fetch) {
  const { chatModel, embedModel } = { ...DEFAULT_AI_CONFIG, ...config };
  const baseUrl = loopbackUrl(config.baseUrl || DEFAULT_AI_CONFIG.baseUrl);

  async function request(path, { body, timeoutMs }) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error'
      });
    } catch (error) {
      throw new AIUnavailableError('The local AI runtime is not reachable.', error);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new AIUnavailableError(data.error || `The local AI runtime returned ${response.status}.`);
    return data;
  }

  return {
    name: 'ollama',
    chatModel,
    embedModel,

    // Reachability and installed models only; it never runs a model, so it stays fast.
    async health() {
      try {
        const [{ version }, { models = [] }] = await Promise.all([
          request('/api/version', { timeoutMs: 3000 }),
          request('/api/tags', { timeoutMs: 3000 })
        ]);
        const installed = new Set(models.map(m => modelKey(m.name)));
        const missing = [chatModel, embedModel].filter(name => !installed.has(modelKey(name)));
        return { reachable: true, version, chatModel, embedModel, missing };
      } catch (error) {
        if (!(error instanceof AIUnavailableError)) throw error;
        return { reachable: false, version: '', chatModel, embedModel, missing: [], error: error.message };
      }
    },

    // One non-streaming chat turn. Pass a JSON schema as `format` for structured output.
    async chat({ messages, format, think = false, temperature = 0.2, contextLength = 8192, timeoutMs = 600000 }) {
      const data = await request('/api/chat', {
        timeoutMs,
        body: { model: chatModel, messages, format, think, stream: false, options: { temperature, num_ctx: contextLength } }
      });
      return {
        content: data.message?.content || '',
        thinking: data.message?.thinking || '',
        usage: { promptTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0, totalMs: Math.round((data.total_duration || 0) / 1e6) }
      };
    },

    async embed(inputs, { timeoutMs = 120000 } = {}) {
      const data = await request('/api/embed', { timeoutMs, body: { model: embedModel, input: inputs } });
      return data.embeddings || [];
    }
  };
}

// Reads the runtime settings from the environment, falling back to the defaults above.
export function aiConfigFromEnv(env = process.env) {
  return {
    baseUrl: env.ADVISORY_AI_URL || DEFAULT_AI_CONFIG.baseUrl,
    chatModel: env.ADVISORY_AI_CHAT_MODEL || DEFAULT_AI_CONFIG.chatModel,
    embedModel: env.ADVISORY_AI_EMBED_MODEL || DEFAULT_AI_CONFIG.embedModel
  };
}
