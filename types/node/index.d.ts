declare module 'path' {
  export function join(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
  export function dirname(path: string): string;
}

declare module 'fs' {
  export const promises: {
    readFile(path: string, encoding: string): Promise<string>;
    writeFile(path: string, data: string, encoding: string): Promise<void>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    readdir(path: string): Promise<string[]>;
    unlink(path: string): Promise<void>;
  };
}

declare module 'crypto' {
  export function randomUUID(): string;
}

declare module 'http' {
  export interface IncomingMessage {
    method?: string;
    url?: string;
    headers: Record<string, string | undefined>;
    on(event: 'data', listener: (chunk: string) => void): this;
    on(event: 'end', listener: () => void): this;
  }

  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    writeHead(statusCode: number): void;
    end(data?: string): void;
  }

  type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

  export function createServer(listener: RequestListener): {
    listen(port: number, callback?: () => void): void;
  };
}

declare function fetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

declare const __dirname: string;

declare namespace NodeJS {
  interface Process {
    exitCode?: number;
    cwd(): string;
    env: Record<string, string | undefined>;
  }
}

declare const process: NodeJS.Process;

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};
