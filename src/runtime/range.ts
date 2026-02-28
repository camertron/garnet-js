import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { RubyString } from "../runtime/string";
import { spaceship_compare } from "./comparable";
import { Object } from "../runtime/object";
import { NameError } from "../errors";

export class Range {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Range");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Range`);
        }

        return this.klass_;
    }

    public begin: RValue;
    public end: RValue;
    public exclude_end: boolean;

    static async new(begin: RValue, end: RValue, exclude_end: boolean): Promise<RValue> {
        return new RValue(await Range.klass(), new Range(begin, end, exclude_end));
    }

    constructor(begin: RValue, end: RValue, exclude_end: boolean) {
        this.begin = begin;
        this.end = end;
        this.exclude_end = exclude_end;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Range", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.data = new Range(args[0], args[1], (args[3] || Qfalse).is_truthy());
            return Qnil;
        });

        klass.define_native_method("begin", (self: RValue): RValue => {
            return self.get_data<Range>().begin;
        });

        klass.define_native_method("end", (self: RValue): RValue => {
            return self.get_data<Range>().end;
        });

        klass.define_native_method("exclude_end?", (self: RValue): RValue => {
            return self.get_data<Range>().exclude_end ? Qtrue : Qfalse;
        });

        klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const range = self.get_data<Range>();
            const begin_cmp = await spaceship_compare(range.begin, args[0], true);
            const end_cmp = await spaceship_compare(range.end, args[0], true);

            if (range.exclude_end) {
                return begin_cmp <= 0 && end_cmp > 0 ? Qtrue : Qfalse;
            } else {
                return begin_cmp <= 0 && end_cmp >= 0 ? Qtrue : Qfalse;
            }

            return Qnil;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const range = self.get_data<Range>();
            const begin_str = (await Object.send(range.begin, "inspect")).get_data<string>();
            const end_str = (await Object.send(range.end, "inspect")).get_data<string>();
            const dots = range.exclude_end ? "..." : "..";

            return RubyString.new(`${begin_str}${dots}${end_str}`);
        });

        await klass.alias_method("to_s", "inspect");
    });

    inited = true;
};
