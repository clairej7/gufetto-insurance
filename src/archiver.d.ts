// Types ambient minimaux pour archiver v8 (le paquet n'embarque pas de .d.ts).
declare module "archiver" {
  export interface ArchiverOptions { zlib?: { level?: number } }
  export class Archiver {
    constructor(format: string, options?: ArchiverOptions);
    append(source: Buffer | NodeJS.ReadableStream, data: { name: string }): this;
    finalize(): Promise<void>;
    on(event: "data", cb: (chunk: Buffer) => void): this;
    on(event: "end", cb: () => void): this;
    on(event: "warning", cb: (err: unknown) => void): this;
    on(event: "error", cb: (err: unknown) => void): this;
    on(event: string, cb: (...args: unknown[]) => void): this;
  }
}
