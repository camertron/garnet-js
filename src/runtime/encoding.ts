import { Class, ObjectClass, RValue, Runtime, String as RubyString } from "../runtime";
import { isLittlEndian } from "../util/endianness";

export abstract class Encoding {
    private static us_ascii_: RValue;
    private static utf_8_: RValue;
    private static utf_16le_: RValue;
    private static utf_16be_: RValue;
    private static binary_: RValue;

    public name: string;

    static get us_ascii(): RValue {
        return this.us_ascii_ ||= Runtime.constants["Encoding"].get_data<Class>().constants["US_ASCII"];
    }

    static get utf_8(): RValue {
        return this.utf_8_ ||= Runtime.constants["Encoding"].get_data<Class>().constants["UTF_8"];
    }

    static get utf_16le(): RValue {
        return this.utf_16le_ ||= Runtime.constants["Encoding"].get_data<Class>().constants["UTF_16LE"];
    }

    static get utf_16be(): RValue {
        return this.utf_16be_ ||= Runtime.constants["Encoding"].get_data<Class>().constants["UTF_16BE"];
    }

    static get binary(): RValue {
        return this.binary_ ||= Runtime.constants["Encoding"].get_data<Class>().constants["BINARY"];
    }

    static get default(): RValue {
        if (isLittlEndian()) {
            return this.utf_16le;
        } else {
            return this.utf_16be;
        }
    }

    abstract codepoint_valid(codepoint: number): boolean;
    abstract codepoint_to_utf16(codepoint: number): string;
}

export class USASCIIEncoding extends Encoding {
    public name: string = "US-ASCII";

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }
}

export class BinaryEncoding extends Encoding {
    public name: string = "BINARY";

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }
}

export abstract class UnicodeEncoding extends Encoding {
    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0 && codepoint < 0x110000
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }
}

export class UTF8Encoding extends UnicodeEncoding {
    public name: string = "UTF-8";
}

export class UTF16LEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16LE";
}

export class UTF16BEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16BE";
}

let inited = false;

export const init = () => {
    if (inited) return false;

    const EncodingClass = Runtime.define_class("Encoding", ObjectClass, (klass: Class) => {
        // making new Encoding instances cannot be done from Ruby land
        klass.get_singleton_class().get_data<Class>().undef_method("new");

        klass.define_native_method("inspect", (self: RValue): RValue => {
            return RubyString.new(`#<Encoding:${self.get_data<Encoding>().name}>`);
        })
    });

    const encoding = EncodingClass.get_data<Class>();
    encoding.constants["US_ASCII"] = new RValue(EncodingClass, new USASCIIEncoding());
    encoding.constants["BINARY"] = new RValue(EncodingClass, new BinaryEncoding());
    encoding.constants["UTF_8"] = new RValue(EncodingClass, new UTF8Encoding());
    encoding.constants["UTF_16LE"] = new RValue(EncodingClass, new UTF16LEEncoding());
    encoding.constants["UTF_16BE"] = new RValue(EncodingClass, new UTF16BEEncoding());

    inited = true;
};
