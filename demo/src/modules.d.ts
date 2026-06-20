declare module "*.wasm" {
  const src: string;
  export default src;
}

declare module "*.woff" {
  const src: string;
  export default src;
}

declare module "*.woff2" {
  const src: string;
  export default src;
}

declare module "@gytx/xterm-local-echo" {
  import type { ITerminalAddon, Terminal } from "xterm";

  export interface Option {
    historySize: number;
    enableAutocomplete: boolean;
    maxAutocompleteEntries: number;
    enableIncompleteInput: boolean;
  }

  export class LocalEchoAddon implements ITerminalAddon {
    constructor(option?: Partial<Option>);

    activate(terminal: Terminal): void;
    dispose(): void;
    read(prompt?: string, continuationPrompt?: string): Promise<string>;
    readChar(prompt: string): Promise<unknown>;
    abortRead(reason?: string): void;
    println(message: string): Promise<void>;
    print(message: string): Promise<void>;
    printWide(items: string[], padding?: number): Promise<void> | undefined;
    addAutocompleteHandler(fn: Function, ...args: unknown[]): void;
    removeAutocompleteHandler(fn: Function): void;
  }
}
