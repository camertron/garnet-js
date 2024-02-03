import { Encoding, Runtime, register_encoding } from "@camertron/garnet-js/src/garnet";
import { to_unicode } from "./unicode-map"

let inited = false;

export class ShiftJisEncoding extends Encoding {
    public name: string = "SHIFT-JIS";
    public conversion_targets = ["UTF-8", "UTF-16LE", "UTF-16BE", "UTF-32"]; // @TODO: is this correct?

    constructor() {
        super(1, 2);
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

    register_encoding("SHIFT_JIS", ["SHIFT-JIS"], new ShiftJisEncoding());

    inited = true;
}

Runtime.register_native_extension("encoding/shift_jis", init);
