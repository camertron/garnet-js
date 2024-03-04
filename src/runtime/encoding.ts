import { Class, ObjectClass, Qfalse, Qtrue, RValue, Runtime } from "../runtime";
import { isLittlEndian } from "../util/endianness";
import { CR_7BIT, CR_UNKNOWN, CR_VALID, String as RubyString } from "../runtime/string";
import { EncodingCompatibilityError } from "../errors";
import { Object } from "../runtime/object";

export abstract class Encoding {
    private static default_: RValue;

    public name: string;

    static get encoding_class(): Class {
        return this.encoding_class_rval.get_data<Class>();
    }

    static get encoding_class_rval(): RValue {
        return Object.find_constant("Encoding")!;
    }

    static get default(): RValue {
        if (isLittlEndian()) {
            this.default_ = this.encoding_class.constants["UTF_16LE"];
        } else {
            this.default_ = this.encoding_class.constants["UTF_16BE"];
        }

        return this.default_;
    }

    static get us_ascii(): RValue {
        return this.get("US_ASCII")!;
    }

    static get binary(): RValue {
        return this.get("BINARY")!;
    }

    static get(name: string): RValue | undefined {
        return encoding_map.get(name);
    }

    // accepts an Encoding instance or an encoded string and returns an Encoding
    static extract(obj: RValue): RValue | undefined {
        if (obj.klass === this.encoding_class_rval) {
            return obj;
        } else if (obj.klass === RubyString.klass) {
            return RubyString.get_encoding_rval(obj);
        }
    }

    // accepts an Encoding instance or a string like "UTF-8" and returns an Encoding
    static coerce(obj: RValue): RValue | undefined {
        if (obj.klass === this.encoding_class_rval) {
            return obj;
        } else if (obj.klass === RubyString.klass) {
            return this.get(obj.get_data<string>());
        } else {
            return undefined;
        }
    }

    static is_ascii(codepoint: number) {
        return codepoint >= 0 && codepoint < 128;
    }

    static supported_conversion(obj1: RValue, obj2: RValue): RValue | null {
        const compat_encoding = this.are_compatible(obj1, obj2);
        if (compat_encoding) return compat_encoding;

        const e1 = this.extract(obj1);
        const e2 = this.extract(obj2);

        if (!e1 || !e2) return null;

        if (encoding_conversions.has(`${e1.get_data<Encoding>().name}:${e2.get_data<Encoding>().name}`)) {
            return e2;
        }

        return null;
    }

    static are_compatible(obj1: RValue, obj2: RValue): RValue | null {
        let enc1 = Encoding.extract(obj1);
        let enc2 = Encoding.extract(obj2);

        if (enc1 == null || enc2 == null) return null;
        if (enc1 == enc2) return enc1;

        if (obj2.klass === RubyString.klass && (obj2.get_data<string>().length == 0)) return enc1;
        if (obj1.klass === RubyString.klass && (obj1.get_data<string>().length == 0)) {
            return enc1.get_data<Encoding>().ascii_compatible && obj2.klass === RubyString.klass && (RubyString.ascii_only(obj2)) ? enc1 : enc2;
        }

        if (!enc1.get_data<Encoding>().ascii_compatible || !enc2.get_data<Encoding>().ascii_compatible) return null;

        if (obj2.klass !== RubyString.klass && enc2 === Encoding.us_ascii) return enc1;
        if (obj1.klass !== RubyString.klass && enc1 === Encoding.us_ascii) return enc2;

        if (obj1.klass !== RubyString.klass) {
            const obj_tmp = obj1; // swap1 obj1 & obj2
            obj1 = obj2;
            obj2 = obj_tmp;

            const enc_tmp = enc1;  // swap their encodings
            enc1 = enc2;
            enc2 = enc_tmp;
        }

        if (obj1.klass === RubyString.klass) {
            const cr1 = RubyString.scan_for_code_range(obj1);

            if (obj2.klass === RubyString.klass) {
                const cr2 = RubyString.scan_for_code_range(obj2);
                return this.are_compatible_(enc1, cr1, enc2, cr2);
            }

            if (cr1 == CR_7BIT) return enc2;
        }

        return null;
    }

    private static are_compatible_(enc1: RValue, cr1: number, enc2: RValue, cr2: number): RValue | null {
        if (cr1 != cr2) {
            // may need to handle ENC_CODERANGE_BROKEN
            if (cr1 == CR_7BIT) return enc2;
            if (cr2 == CR_7BIT) return enc1;
        }

        if (cr2 == CR_7BIT) return enc1;
        if (cr1 == CR_7BIT) return enc2;

        return null;
    }

    static enc_asciicompat(enc: RValue): boolean {
        return enc.get_data<Encoding>().min_length == 1;
    }

    static enc_cr_str_buf_cat(str: RValue, str2: RValue): number {
        const str_enc = RubyString.get_encoding_rval(str);
        const str2_enc = RubyString.get_encoding_rval(str2);
        let str2_cr = RubyString.get_code_range(str2);
        let res_enc: RValue;
        let str_cr, res_cr;
        let incompatible = false;

        str_cr = str.get_data<string>().length > 0 ? RubyString.get_code_range(str) : CR_7BIT;

        if (str_enc == str2_enc) {
            if (str_cr === CR_UNKNOWN) {
                str2_cr = CR_UNKNOWN;
            } else if (str2_cr === CR_UNKNOWN) {
                str2_cr = RubyString.scan_for_code_range(str2);
            }
        } else {
            if (!this.enc_asciicompat(str_enc) || !this.enc_asciicompat(str2_enc)) {
                if (str2.get_data<string>().length == 0) return str2_cr;
                if (str.get_data<string>().length == 0) {
                    str.data = str.get_data<string>() + str2.get_data<string>();
                    RubyString.set_encoding(str, str2_enc);
                    RubyString.set_code_range(str, str2_cr);
                    return str2_cr;
                }

                incompatible = true;
            }

            if (!incompatible) {
                if (str2_cr === CR_UNKNOWN) {
                    str2_cr = RubyString.scan_for_code_range(str2);
                }

                if (str_cr == CR_UNKNOWN) {
                    if (str_enc === Encoding.us_ascii || str2_cr !== CR_7BIT) {
                        str_cr = RubyString.scan_for_code_range(str);
                    }
                }
            }
        }

        if (incompatible ||
                (str_enc !== str2_enc &&
                str_cr != CR_7BIT &&
                str2_cr != CR_7BIT)) {
            throw new EncodingCompatibilityError(`incompatible encodings: ${str_enc.get_data<Encoding>().name} and ${str2_enc.get_data<Encoding>().name}`);
        }

        if (str_cr === CR_UNKNOWN) {
            res_enc = str_enc;
            res_cr = CR_UNKNOWN;
        } else if (str_cr === CR_7BIT) {
            if (str2_cr == CR_7BIT) {
                res_enc = str_enc;
                res_cr = CR_7BIT;
            } else {
                res_enc = str2_enc;
                res_cr = str2_cr;
            }
        } else if (str_cr === CR_VALID) {
            res_enc = str_enc;
            if (str2_cr === CR_7BIT || str2_cr === CR_VALID) {
                res_cr = str_cr;
            } else {
                res_cr = str2_cr;
            }
        } else { // str_cr must be BROKEN at this point
            res_enc = str_enc;
            res_cr = str_cr;
            if (0 < str2.get_data<string>().length) res_cr = CR_UNKNOWN;
        }

        // MRI checks for len < 0 here, but I don't think that's possible for us

        str.data = str.get_data<string>() + str2.get_data<string>();
        RubyString.set_encoding(str, res_enc);
        RubyString.set_code_range(str, res_cr);

        return str2_cr;
    }

    abstract codepoint_valid(codepoint: number): boolean;
    abstract codepoint_to_utf16(codepoint: number): string;
    abstract bytesize(str: string): number;

    abstract conversion_targets: string[];

    public min_length: number;
    public max_length: number;
    public ascii_compatible: boolean;

    constructor(min_length: number, max_length: number) {
        this.min_length = min_length;
        this.max_length = max_length;
        this.ascii_compatible = this.min_length == 1;
    }
}

export class USASCIIEncoding extends Encoding {
    public name: string = "US-ASCII";
    public conversion_targets = ["BINARY", "US-ASCII", "UTF-8", "UTF-16LE", "UTF-16BE", "UTF-32"];

    constructor() {
        super(1, 1);
    }

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }

    bytesize(str: string): number {
        return str.length;
    }
}

export class BinaryEncoding extends Encoding {
    public name: string = "BINARY";
    public conversion_targets = ["US-ASCII"];

    constructor() {
        super(1, 1);
    }

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }

    bytesize(str: string): number {
        return str.length;
    }
}

export abstract class UnicodeEncoding extends Encoding {
    public conversion_targets = ["US-ASCII", "UTF-8", "UTF-16LE", "UTF-16BE", "UTF-32", "SHIFT-JIS", "EUC-JP"];

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0 && codepoint < 0x110000
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }
}

export class UTF8Encoding extends UnicodeEncoding {
    public name: string = "UTF-8";

    constructor() {
        super(1, 4);
    }

    codepoint_valid(codepoint: number): boolean {
        return (
            // standard unicode range
            (codepoint >= 0 && codepoint < 0x110000) &&

            // invalid in UTF-8 specifically (not sure why?)
            (codepoint < 55296 || codepoint > 57343)
        );
    }

    bytesize(str: string): number {
        let size = 0;

        for (let i = 0; i < str.length; i ++) {
            const cp = str.codePointAt(i)!;

            if (cp < 0x80) {
                size ++;
            } else if (cp < 0x800) {
                size += 2;
            } else if (cp < 0x10000) {
                size += 3;
            } else if (cp < 0x110000) {
                size += 4;
            } else {
                throw new RangeError(`invalid codepoint 0xd800 in UTF-8`)
            }
        }

        return size;
    }
}

export class UTF16LEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16LE";

    constructor() {
        super(2, 2);
    }

    bytesize(str: string): number {
        return str.length * 2;
    }
}

export class UTF16BEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16BE";

    constructor() {
        super(2, 2);
    }

    bytesize(str: string): number {
        return str.length * 2;
    }
}

export class UTF32Encoding extends UnicodeEncoding {
    public name: string = "UTF-32";

    constructor() {
        super(4, 4);
    }

    bytesize(str: string): number {
        return str.length * 4;
    }
}

const encoding_map: Map<string, RValue> = new Map();
const encoding_conversions: Set<string> = new Set();

export const register_encoding = (const_name: string, other_names: string[], encoding: Encoding) => {
    const encoding_class = Object.find_constant("Encoding")!;
    const encoding_rval = new RValue(encoding_class, encoding);
    encoding_class.get_data<Class>().constants[const_name] = encoding_rval;
    encoding_map.set(const_name, encoding_rval);

    for (const name of other_names) {
        encoding_map.set(name, encoding_rval);
    }

    for (const target of encoding.conversion_targets) {
        encoding_conversions.add(`${encoding.name}:${target}`);
    }
}

let inited = false;

export const init = () => {
    if (inited) return false;

    const EncodingClass = Runtime.define_class("Encoding", ObjectClass, (klass: Class) => {
        // making new Encoding instances cannot be done from Ruby land
        klass.get_singleton_class().get_data<Class>().undef_method("new");

        klass.define_native_method("inspect", (self: RValue): RValue => {
            return RubyString.new(`#<Encoding:${self.get_data<Encoding>().name}>`);
        });

        klass.define_native_method("compatible?", (self: RValue, args: RValue[]): RValue => {
            return Encoding.are_compatible(self, args[0]) ? Qtrue : Qfalse;
        });

        klass.define_native_method("ascii_compatible?", (self: RValue): RValue => {
            return self.get_data<Encoding>().ascii_compatible ? Qtrue : Qfalse;
        });

        // @TODO: support dummy encodings?
        klass.define_native_method("dummy?", (self: RValue): RValue => {
            return Qfalse;
        });
    });

    register_encoding("US_ASCII", ["US-ASCII"], new USASCIIEncoding());
    register_encoding("BINARY", [], new BinaryEncoding());
    register_encoding("UTF_8", ["UTF-8"], new UTF8Encoding());
    register_encoding("UTF_16LE", ["UTF-16LE"], new UTF16LEEncoding());
    register_encoding("UTF_16BE", ["UTF-16BE"], new UTF16BEEncoding());
    register_encoding("UTF_32", ["UTF-32"], new UTF32Encoding());

    Runtime.define_class_under(EncodingClass, "CompatibilityError", Object.find_constant("EncodingError")!);
    Runtime.define_class_under(EncodingClass, "ConverterNotFoundError", Object.find_constant("EncodingError")!);

    inited = true;
};
