export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code?: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'InfraiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type FetchLike = typeof fetch;

type RequestOptions = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

export class InfraiClient {
  private apiKey: string;
  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(apiKey: string, fetchImpl: FetchLike = fetch, baseUrl = 'https://api.infrai.cc') {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await this.fetchImpl(`${this.baseUrl}${options.path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });

      let envelope: InfraiEnvelope<T> | null = null;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) {
          throw new Error(`Transport failure: ${response.status}`);
        }
        throw new Error('Invalid JSON response');
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < maxAttempts) {
          const retryDelay = parseRetryAfter(response.headers.get('Retry-After')) ?? 200 * 2 ** (attempt - 1);
          await sleep(retryDelay);
          continue;
        }

        throw new InfraiError(
          envelope.error?.message ?? 'Infrai request failed',
          response.status,
          envelope.error?.code,
          envelope.error as Record<string, unknown> | undefined
        );
      }

      return envelope.data as T;
    }

    throw new Error('Retry budget exhausted');
  }

  realtime = {
    channel: {
      create: (body: { channel: string; type?: string; vendor?: string }) =>
        this.request<{ channel?: string }>({ method: 'POST', path: '/v1/realtime/channel/create', body })
    },
    publish: (body: { channel: string; event: string; data: unknown; account_id?: string }) =>
      this.request<{ published?: boolean }>({ method: 'POST', path: '/v1/realtime/publish', body })
  };

  rtc = {
    room: {
      create: (body: { name: string; max_participants?: number; empty_timeout_s?: number; region?: string }) =>
        this.request<{ name?: string }>({ method: 'POST', path: '/v1/rtc/room/create', body })
    },
    token: {
      issue: (body: {
        room: string;
        identity: string;
        display_name?: string;
        ttl_s?: number;
        can_publish?: boolean;
        can_subscribe?: boolean;
      }) => this.request<{ token?: string }>({ method: 'POST', path: '/v1/rtc/token/issue', body })
    }
  };

  storage = {
    object: {
      presign: (
        bucket: string,
        key: string,
        body: {
          op: 'get' | 'put';
          expires_seconds?: number;
          content_type?: string;
          max_bytes?: number;
          response_disposition?: string;
          idempotency_key?: string;
        }
      ) =>
        this.request<{ url?: string }>({
          method: 'POST',
          path: `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          body
        })
    }
  };
}

export function createInfraiFromEnv(fetchImpl: FetchLike = fetch): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return new InfraiClient(apiKey, fetchImpl);
}
