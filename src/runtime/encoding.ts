import { Class, IOClass, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { CR_7BIT, RubyString as RubyString } from "../runtime/string";
import { ArgumentError } from "../errors";
import { Object } from "../runtime/object";
import { Args } from "./arg-scanner";
import { each_code_point } from "../util/string_utils";
import { Symbol } from "./symbol";
import { Regexp } from "./regexp";

export abstract class Encoding {
    public static default_external: RValue;
    public static default_internal: RValue;

    public name: string;

    static async encoding_class(): Promise<Class> {
        return (await this.klass()).get_data<Class>();
    }

    static async klass(): Promise<RValue> {
        return (await Object.find_constant("Encoding"))!;
    }

    static get us_ascii(): RValue {
        return this.get("us-ascii")!;
    }

    static get binary(): RValue {
        return this.get("binary")!;
    }

    static get(name: string): RValue | undefined {
        return encoding_map.get(normalize_enc_name(name));
    }

    static get_or_throw(name: string): RValue {
        const encoding = this.get(name);
        if (encoding) return encoding;

        throw new ArgumentError(`unknown encoding name - ${name}`);
    }

    // accepts an Encoding instance or an encoded string and returns an Encoding
    static async extract(obj: RValue): Promise<RValue | undefined> {
        if (obj.klass === await this.klass()) {
            return obj;
        } else {
            switch (obj.klass) {
                case await RubyString.klass():
                case await Symbol.klass():
                case await Regexp.klass():
                case await IOClass:
                    return await Object.send(obj, "encoding");
            }
        }
    }

    // accepts an Encoding instance or a string like "UTF-8" and returns an Encoding
    static async coerce(obj: RValue): Promise<RValue | undefined> {
        if (obj.klass === await this.klass()) {
            return obj;
        } else if (obj.klass === await RubyString.klass()) {
            return this.get(obj.get_data<string>());
        } else {
            return undefined;
        }
    }

    static async coerce_bang(obj: RValue): Promise<RValue | undefined> {
        if (obj.klass === await this.klass()) {
            return obj;
        } else if (obj.klass === await RubyString.klass()) {
            return this.get_or_throw(obj.get_data<string>());
        } else {
            return undefined;
        }
    }

    static is_ascii(codepoint: number) {
        return codepoint >= 0 && codepoint < 128;
    }

    static async supported_conversion(obj1: RValue, obj2: RValue): Promise<RValue | null> {
        const compat_encoding = await this.are_compatible(obj1, obj2);
        if (compat_encoding) return compat_encoding;

        const e1 = await this.extract(obj1);
        const e2 = await this.extract(obj2);

        if (!e1 || !e2) return null;

        const e1_name = normalize_enc_name(e1.get_data<Encoding>().name);
        const e2_name = normalize_enc_name(e2.get_data<Encoding>().name);

        if (encoding_conversions.has(`${e1_name}:${e2_name}`)) {
            return e2;
        }

        return null;
    }

    static async are_compatible(obj1: RValue, obj2: RValue): Promise<RValue | null> {
        let enc1 = await Encoding.extract(obj1);
        let enc2 = await Encoding.extract(obj2);

        if (enc1 == null || enc2 == null) return null;
        if (enc1 == enc2) return enc1;

        if (obj2.klass === await RubyString.klass() && (obj2.get_data<string>().length == 0)) return enc1;
        if (obj1.klass === await RubyString.klass() && (obj1.get_data<string>().length == 0)) {
            return enc1.get_data<Encoding>().ascii_compatible && obj2.klass === await RubyString.klass() && (await RubyString.ascii_only(obj2)) ? enc1 : enc2;
        }

        if (!enc1.get_data<Encoding>().ascii_compatible || !enc2.get_data<Encoding>().ascii_compatible) return null;

        if (obj2.klass !== await RubyString.klass() && enc2 === Encoding.us_ascii) return enc1;
        if (obj1.klass !== await RubyString.klass() && enc1 === Encoding.us_ascii) return enc2;

        if (obj1.klass !== await RubyString.klass()) {
            const obj_tmp = obj1; // swap1 obj1 & obj2
            obj1 = obj2;
            obj2 = obj_tmp;

            const enc_tmp = enc1;  // swap their encodings
            enc1 = enc2;
            enc2 = enc_tmp;
        }

        if (obj1.klass === await RubyString.klass()) {
            const cr1 = RubyString.scan_for_code_range(obj1);

            if (obj2.klass === await RubyString.klass()) {
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

    abstract codepoint_valid(codepoint: number): boolean;
    abstract codepoint_to_utf16(codepoint: number): string;
    abstract unicode_to_codepoint(unicode_cp: number): number;
    abstract bytesize(str: string): number;
    abstract string_to_bytes(str: string): Uint8Array;
    abstract bytes_to_string(bytes: Uint8Array): string;
    abstract is_representable(str: string): boolean;

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
    public conversion_targets = ["binary", "us-ascii", "utf-8", "utf-16le", "utf-16be", "utf-32"];
    private _decoder: TextDecoder;

    constructor() {
        super(1, 1);
    }

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }

    unicode_to_codepoint(unicode_cp: number): number {
        return unicode_cp;
    }

    bytesize(str: string): number {
        return str.length;
    }

    string_to_bytes(str: string): Uint8Array {
        const result = new Uint8Array(this.bytesize(str));

        for (let i = 0; i < result.length; i ++) {
            // only pull out one byte per character by lopping off any high bits
            result[i] = str.charCodeAt(i) & 0xFF;
        }

        return result;
    }

    bytes_to_string(bytes: Uint8Array): string {
        return this.decoder.decode(bytes);
    }

    private get decoder() {
        if (!this._decoder) {
            this._decoder = new TextDecoder("ascii");
        }

        return this._decoder;
    }

    is_representable(str: string): boolean {
        for (const cp of each_code_point(str)) {
            if (cp > 255) {
                return false;
            }
        }

        return true;
    }
}

export class ASCII8BitEncoding extends Encoding {
    public name: string = "ASCII-8BIT";
    public conversion_targets = ["us-ascii", "ascii-8bit"];
    private _decoder: TextDecoder;

    constructor() {
        super(1, 1);
    }

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0x0 && codepoint < 0x100;
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }

    unicode_to_codepoint(unicode_cp: number): number {
        return unicode_cp;
    }

    bytesize(str: string): number {
        return str.length;
    }

    string_to_bytes(str: string): Uint8Array {
        const result = new Uint8Array(this.bytesize(str));

        for (let i = 0; i < result.length; i ++) {
            // only pull out one byte per character by lopping off any high bits
            result[i] = str.charCodeAt(i) & 0xFF;
        }

        return result;
    }

    bytes_to_string(bytes: Uint8Array): string {
        return this.decoder.decode(bytes);
    }

    private get decoder() {
        if (!this._decoder) {
            this._decoder = new TextDecoder("utf-16le");
        }

        return this._decoder;
    }

    is_representable(str: string): boolean {
        for (const cp of each_code_point(str)) {
            if (cp > 255) {
                return false;
            }
        }

        return true;
    }
}

export abstract class UnicodeEncoding extends Encoding {
    public conversion_targets = ["us-ascii", "utf-8", "utf-16le", "utf-16be", "utf-32", "shift-jis", "euc-jp"];

    codepoint_valid(codepoint: number): boolean {
        return codepoint >= 0 && codepoint < 0x110000
    }

    codepoint_to_utf16(codepoint: number): string {
        return String.fromCodePoint(codepoint);
    }

    unicode_to_codepoint(unicode_cp: number): number {
        return unicode_cp;
    }

    is_representable(str: string): boolean {
        // This is not strictly correct but it's fine for now
        return true;
    }
}

export class UTF8Encoding extends UnicodeEncoding {
    public name: string = "UTF-8";
    private _encoder: TextEncoder;
    private _decoder: TextDecoder;

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
                throw new RangeError(`invalid codepoint 0xD800 in UTF-8`)
            }
        }

        return size;
    }

    string_to_bytes(str: string): Uint8Array {
        return this.encoder.encode(str);
    }

    bytes_to_string(bytes: Uint8Array): string {
        return this.decoder.decode(bytes);
    }

    private get encoder() {
        if (!this._encoder) {
            this._encoder = new TextEncoder();
        }

        return this._encoder;
    }

    private get decoder() {
        if (!this._decoder) {
            this._decoder = new TextDecoder();
        }

        return this._decoder;
    }
}

export class UTF16LEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16LE";
    private _decoder: TextDecoder;

    constructor() {
        super(2, 2);
    }

    bytesize(str: string): number {
        return str.length * 2;
    }

    string_to_bytes(str: string): Uint8Array {
        const result = new Uint8Array(this.bytesize(str));

        for (let i = 0, offset = 0; i < str.length; i++) {
            const codeUnit = str.charCodeAt(i);
            result[offset ++] = codeUnit & 0xFF;
            result[offset ++] = codeUnit >> 8;
        }

        return result;
    }

    bytes_to_string(bytes: Uint8Array): string {
        return this._decoder.decode(bytes);
    }

    private get decoder() {
        if (!this._decoder) {
            this._decoder = new TextDecoder("utf-16le");
        }

        return this._decoder;
    }
}

export class UTF16BEEncoding extends UnicodeEncoding {
    public name: string = "UTF-16BE";
    private _decoder: TextDecoder;

    constructor() {
        super(2, 2);
    }

    bytesize(str: string): number {
        return str.length * 2;
    }

    string_to_bytes(str: string): Uint8Array {
        const result = new Uint8Array(this.bytesize(str));

        for (let i = 0, offset = 0; i < str.length; i++) {
            const codeUnit = str.charCodeAt(i);
            result[offset ++] = codeUnit >> 8;
            result[offset ++] = codeUnit & 0xFF;
        }

        return result;
    }

    bytes_to_string(bytes: Uint8Array): string {
        return this.decoder.decode(bytes);
    }

    private get decoder() {
        if (!this._decoder) {
            this._decoder = new TextDecoder("utf-16be");
        }

        return this._decoder;
    }
}

export class UTF32Encoding extends UnicodeEncoding {
    public name: string = "UTF-32";

    constructor() {
        super(4, 4);
    }

    bytesize(str: string): number {
        let length = 0;

        for (let i = 0; i < str.length; i ++) {
            const code_unit = str.charCodeAt(i);

            if (code_unit >= 0xD800 && code_unit <= 0xDBFF) {
                i ++; // Skip the low surrogate
            }

            length += 4;
        }

        return length;
    }

    string_to_bytes(str: string): Uint8Array {
        // Create a Uint8Array to hold the UTF-32 encoded bytes
        const result = new Uint8Array(this.bytesize(str));
        let offset = 0;

        for (let i = 0; i < str.length; i++) {
            let code_point: number;
            const code_unit = str.charCodeAt(i);

            if (code_unit >= 0xD800 && code_unit <= 0xDBFF) {
                // High surrogate
                const high_surrogate = code_unit;
                const low_surrogate = str.charCodeAt(++ i); // Get the low surrogate

                if (low_surrogate >= 0xDC00 && low_surrogate <= 0xDFFF) {
                    // Combine surrogate pair to get the actual code point
                    code_point = 0x10000 + ((high_surrogate - 0xD800) << 10) + (low_surrogate - 0xDC00);
                } else {
                    throw new Error('Invalid surrogate pair');
                }
            } else {
                // Single code unit
                code_point = code_unit;
            }

            // Convert the code point to UTF-32 and store in the array
            result[offset ++] = (code_point >> 24) & 0xFF;
            result[offset ++] = (code_point >> 16) & 0xFF;
            result[offset ++] = (code_point >> 8) & 0xFF;
            result[offset ++] = code_point & 0xFF;
        }

        return result;
    }

    bytes_to_string(bytes: Uint8Array): string {
        const code_points: number[] = [];

        for (let i = 0; i < bytes.length; i += 4) {
            const code_point = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
            code_points.push(code_point);
        }

        return String.fromCodePoint(...code_points);
    }
}

const encoding_map: Map<string, RValue> = new Map();
const encoding_conversions: Set<string> = new Set();

const normalize_enc_name = (name: string): string => {
    return name.replaceAll("_", "-").toLowerCase();
}

const normalize_enc_const_name = (name: string): string => {
    return name.replaceAll("-", "_").toUpperCase();
}

export const register_encoding = async (name: string, other_names: string[], encoding: Encoding) => {
    const encoding_class = (await Object.find_constant("Encoding"))!;
    const encoding_rval = new RValue(encoding_class, encoding);
    const const_name = normalize_enc_const_name(name)
    encoding_class.get_data<Class>().constants[const_name] = encoding_rval;
    encoding_map.set(normalize_enc_name(name), encoding_rval);

    for (const other_name of other_names) {
        const other_const_name = normalize_enc_const_name(other_name);
        encoding_class.get_data<Class>().constants[other_const_name] = encoding_rval;
        encoding_map.set(normalize_enc_name(other_name), encoding_rval);
    }

    for (const target of encoding.conversion_targets) {
        encoding_conversions.add(`${normalize_enc_name(encoding.name)}:${normalize_enc_name(target)}`);
    }
}

let inited = false;

export const init = async () => {
    if (inited) return false;

    const EncodingClass = Runtime.define_class("Encoding", ObjectClass, async (klass: Class) => {
        // making new Encoding instances cannot be done from Ruby land
        klass.get_singleton_class().get_data<Class>().undef_method("new");

        await Object.send(klass.get_singleton_class(), "attr_reader", [await Runtime.intern("default_external")]);
        await Object.send(klass.get_singleton_class(), "attr_reader", [await Runtime.intern("default_internal")]);

        klass.define_native_singleton_method("default_external=", async (_self: RValue, args: RValue[]) => {
            const [enc_or_name] = await Args.scan("1", args);

            if (enc_or_name === Qnil) {
                Encoding.default_external = Qnil;
                return Qnil;
            }

            await Runtime.assert_type(enc_or_name, await RubyString.klass(), await Encoding.klass());

            const encoding = (await Encoding.coerce_bang(enc_or_name))!;
            Encoding.default_external = encoding;

            return enc_or_name;
        });

        klass.define_native_singleton_method("default_internal=", async (_self: RValue, args: RValue[]) => {
            const [enc_or_name] = await Args.scan("1", args);

            if (enc_or_name === Qnil) {
                Encoding.default_internal = Qnil;
                return Qnil;
            }

            await Runtime.assert_type(enc_or_name, await RubyString.klass(), await Encoding.klass());

            const encoding = (await Encoding.coerce_bang(enc_or_name))!;
            Encoding.default_internal = encoding;

            return enc_or_name;
        });

        await Object.send(klass.rval, "default_internal=", [Qnil]);
        await Object.send(klass.rval, "default_external=", [await Encoding.get("utf-8")!]);

        klass.define_native_singleton_method("find", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const [name_rval] = await Args.scan("1", args);
            await Runtime.assert_type(name_rval, await RubyString.klass());

            const name = name_rval.get_data<string>();
            return Encoding.get(name) || Qnil;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(`#<Encoding:${self.get_data<Encoding>().name}>`);
        });

        await klass.alias_method("to_s", "inspect");

        klass.define_native_singleton_method("compatible?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const [encodable1, encodable2] = await Args.scan("2", args);
            const encoding = await Encoding.are_compatible(encodable1, encodable2);
            return encoding || Qnil;
        });

        klass.define_native_method("ascii_compatible?", (self: RValue): RValue => {
            return self.get_data<Encoding>().ascii_compatible ? Qtrue : Qfalse;
        });

        // @TODO: support dummy encodings?
        klass.define_native_method("dummy?", (self: RValue): RValue => {
            return Qfalse;
        });
    });

    await register_encoding("ascii", ["us-ascii"], new USASCIIEncoding());
    await register_encoding("ascii-8bit", ["binary"], new ASCII8BitEncoding());
    await register_encoding("utf-8", [], new UTF8Encoding());
    await register_encoding("utf-16le", [], new UTF16LEEncoding());
    await register_encoding("utf-16be", [], new UTF16BEEncoding());
    await register_encoding("utf-32", [], new UTF32Encoding());

    await Runtime.define_class_under(EncodingClass, "CompatibilityError", (await Object.find_constant("EncodingError"))!);
    await Runtime.define_class_under(EncodingClass, "ConverterNotFoundError", (await Object.find_constant("EncodingError"))!);

    inited = true;
};
