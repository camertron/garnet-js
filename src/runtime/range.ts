import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { spaceship_compare } from "./comparable";
import { Object } from "../runtime/object";

export class Range {
    public begin: RValue;
    public end: RValue;
    public exclude_end: boolean;

    static new(begin: RValue, end: RValue, exclude_end: boolean): RValue {
        return new RValue(Object.find_constant("Range")!, new Range(begin, end, exclude_end));
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
    });

    inited = true;
};
