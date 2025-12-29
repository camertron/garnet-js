import { Encoding, Runtime, register_encoding } from "@camertron/garnet-js";
import { to_unicode } from "./unicode-map"

let inited = false;

export class EUCJPEncoding extends Encoding {
    public name: string = "EUC-JP";
    public conversion_targets = ["US-ASCII"]; // @TODO: is this correct?

    constructor() {
        super(1, 3);
    }

    codepoint_valid(codepoint: number): boolean {
        return to_unicode.has(codepoint);
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(to_unicode.get(codepoint)!);
    }
}

export const init = () => {
    if (inited) return;

    register_encoding("EUC_JP", ["EUC-JP"], new EUCJPEncoding());

    inited = true;
}

Runtime.register_native_extension("encoding/euc_jp", init);
