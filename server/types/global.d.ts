// Type declarations for Node.js 18+ native fetch API
// These are available globally in Node.js 18+ but TypeScript needs explicit declarations

declare global {
  // AbortController and AbortSignal (available in Node.js 15+)
  var AbortController: {
    prototype: AbortController;
    new(): AbortController;
  };

  interface AbortController {
    readonly signal: AbortSignal;
    abort(reason?: any): void;
  }

  interface AbortSignal {
    readonly aborted: boolean;
    readonly reason: any;
    onabort: ((this: AbortSignal, ev: Event) => any) | null;
    throwIfAborted(): void;
  }

  // Fetch API (available in Node.js 18+)
  var fetch: typeof globalThis.fetch;

  interface RequestInit {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    signal?: AbortSignal | null;
    credentials?: RequestCredentials;
    cache?: RequestCache;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy;
    integrity?: string;
    keepalive?: boolean;
    mode?: RequestMode;
  }

  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly body: ReadableStream<Uint8Array> | null;
    readonly bodyUsed: boolean;
    readonly type: ResponseType;
    readonly url: string;
    readonly redirected: boolean;
    clone(): Response;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    formData(): Promise<FormData>;
    json(): Promise<any>;
    text(): Promise<string>;
  }

  function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export {};
