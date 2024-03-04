import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { String } from "../runtime/string";
import { spaceship_compare } from "./comparable";
import { Object } from "../runtime/object";

export class Range {
    private static klass_: RValue;

    private static get klass(): RValue {
        if (!this.klass_) {
            this.klass_ = Object.find_constant("Range")!;
        }

        return this.klass_;
    }

    public begin: RValue;
    public end: RValue;
    public exclude_end: boolean;

    static new(begin: RValue, end: RValue, exclude_end: boolean): RValue {
        return new RValue(Range.klass, new Range(begin, end, exclude_end));
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

    Runtime.define_class("Range", ObjectClass, (klass: Class) => {
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

        klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
            const range = self.get_data<Range>();
            const begin_cmp = spaceship_compare(range.begin, args[0]);
            const end_cmp = spaceship_compare(range.end, args[0]);

            if (begin_cmp && end_cmp) {
                if (range.exclude_end) {
                    return begin_cmp >= 0 && end_cmp < 0 ? Qtrue : Qfalse;
                } else {
                    return begin_cmp >= 0 && end_cmp <= 0 ? Qtrue : Qfalse;
                }
            }

            return Qnil;
        });

        klass.define_native_method("inspect", (self: RValue): RValue => {
            const range = self.get_data<Range>();
            const begin_str = Object.send(range.begin, "inspect").get_data<string>();
            const end_str = Object.send(range.end, "inspect").get_data<string>();
            const dots = range.exclude_end ? "..." : "..";

            return String.new(`${begin_str}${dots}${end_str}`);
        })
    });

    inited = true;
};
