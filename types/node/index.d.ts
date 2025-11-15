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
  };
}

declare module 'crypto' {
  export function randomUUID(): string;
}

declare const __dirname: string;

declare namespace NodeJS {
  interface Process {
    exitCode?: number;
    cwd(): string;
  }
}

declare const process: NodeJS.Process;

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
};
