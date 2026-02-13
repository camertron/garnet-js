import { NameError } from "../errors";
import { Class, ObjectClass, Qfalse, Qnil, Runtime, RValue } from "../runtime";
import { Args } from "../runtime/arg-scanner";
import { Encoding } from "../runtime/encoding";
import { Hash } from "../runtime/hash";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object";
import { Regexp } from "../runtime/regexp";
import { RubyString } from "../runtime/string";

let inited = false;

export class StringScanner {
    private static klass_: RValue;

    static async subclass_new(klass: RValue, str: RValue, fixed_anchor: RValue): Promise<RValue> {
        return new RValue(klass, new StringScanner(str.get_data<string>(), await RubyString.get_encoding(str), fixed_anchor.is_truthy()));
    }

    static async new(str: RValue, fixed_anchor: RValue): Promise<RValue> {
        return this.subclass_new(await this.klass(), str, fixed_anchor);
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("StringScanner");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant StringScanner");
            }
        }

        return this.klass_;
    }

    public str: string;
    public encoding: Encoding;
    public fixed_anchor: boolean;
    public charpos: number;
    public bytepos: number;

    constructor(str: string, encoding: Encoding, fixed_anchor: boolean) {
        this.str = str;
        this.encoding = encoding;
        this.fixed_anchor = fixed_anchor;
        this.charpos = 0;
        this.bytepos = 0;
    }

    async scan_re(re: Regexp): Promise<string | null> {
        const match = re.search(this.str, this.charpos);
        if (!match) return null;

        this.charpos = match.end(0);
        this.bytepos = match.end(0) * 2;

        return match.str;
    }

    async scan_str(str: string): Promise<string | null> {
        const slice = this.str.slice(this.charpos, this.charpos + str.length);

        if (slice === str) {
            this.charpos += str.length;
            this.bytepos += str.length * 2;
            return slice;
        }

        return null;
    }

    rest(): string {
        return this.str.slice(this.charpos);
    }

    set_pos(new_bytepos: number) {
        this.bytepos = new_bytepos;
        this.charpos = Math.floor(new_bytepos / 2);
    }
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringScanner", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", async (self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
            const [str_rval] = await Args.scan("1", args);
            const str = await Runtime.coerce_to_string(str_rval);
            const fixed_anchor = await Args.get_kwarg("fixed_anchor", kwargs);
            const encoding = await RubyString.get_encoding(str);
            self.data = new StringScanner(str.get_data<string>(), encoding, (fixed_anchor || Qfalse).is_truthy());
            return Qnil;
        });

        klass.define_native_method("scan", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const scanner = self.get_data<StringScanner>();
            const [pattern_rval] = await Args.scan("1", args);
            let result;

            if ((await Object.send(pattern_rval, "is_a?", [await Regexp.klass()])).is_truthy()) {
                result = await scanner.scan_re(pattern_rval.get_data<Regexp>());
            } else {
                const pattern = await Runtime.coerce_to_string(pattern_rval);
                result = await scanner.scan_str(pattern.get_data<string>());
            }

            return result ? await RubyString.new(result) : Qnil;
        });

        klass.define_native_method("pos", async (self: RValue): Promise<RValue> => {
            return await Integer.get(self.get_data<StringScanner>().bytepos);
        });

        klass.define_native_method("pos=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [pos_rval] = await Args.scan("1", args);
            await Runtime.assert_type(pos_rval, await Integer.klass());
            self.get_data<StringScanner>().set_pos(pos_rval.get_data<number>());
            return pos_rval;
        });

        klass.define_native_method("rest", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<StringScanner>().rest());
        });
    });

    inited = true;
}
