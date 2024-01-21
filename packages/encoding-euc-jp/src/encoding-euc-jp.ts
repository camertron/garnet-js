import { Class, Encoding, RValue, Runtime } from "@camertron/yarv-js/src/yarv";
import { to_unicode } from "./unicode-map"

let inited = false;

export class EUCJPEncoding extends Encoding {
    public name: string = "EUC-JP";

    codepoint_valid(codepoint: number): boolean {
        return to_unicode.has(codepoint);
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(to_unicode.get(codepoint)!);
    }
}

export const init = () => {
    if (inited) return;

    const encoding_class = Runtime.constants["Encoding"];
    const encoding = encoding_class.get_data<Class>();
    encoding.constants["EUC_JP"] = new RValue(encoding_class, new EUCJPEncoding());

    inited = true;
}

Runtime.register_native_extension("encoding/euc_jp", init);
