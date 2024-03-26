import { Class, RValue, Runtime, Qnil, ObjectClass } from "../runtime";
import { String } from "../runtime/string";
import { Object } from "../runtime/object";
import { Integer } from "./integer";
import { Numeric } from "./numeric";
import { NameError } from "../errors";

export class Float {
    private static klass_: RValue;

    static new(value: number): RValue {
        return new RValue(this.klass, value);
    }

    static get klass(): RValue {
        const klass = Object.find_constant("Float");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Float`);
        }

        return this.klass_;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Float", Numeric.klass, (klass: Class) => {
        klass.define_native_method("inspect", (self: RValue): RValue => {
            return String.new(self.get_data<number>().toString());
        });

        klass.define_native_method("/", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], Numeric.klass);
            return Float.new(self.get_data<number>() / args[0].get_data<number>());
        });

        klass.define_native_method("-", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], Numeric.klass);
            return Float.new(self.get_data<number>() - args[0].get_data<number>());
        });

        klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], Numeric.klass);
            return Float.new(self.get_data<number>() * args[0].get_data<number>());
        });

        klass.define_native_method("round", (self: RValue, args: RValue[]): RValue => {
            const num = self.get_data<number>();
            let ndigits = 0;

            if (args.length > 0) {
                Runtime.assert_type(args[0], Integer.klass);
                ndigits = args[0].get_data<number>();
            }

            if (ndigits === 0) {
                return Integer.get(Math.round(num));
            } else if (ndigits > 0) {
                const multiplier = Math.pow(10, ndigits);
                return Float.new(Math.round((num + Number.EPSILON) * multiplier) / multiplier);
            } else {
                const multiplier = Math.pow(10, Math.abs(ndigits));
                return Integer.get(Math.round(num / multiplier) * multiplier);
            }
        });

        klass.define_native_method("<=>", (self: RValue, args: RValue[]): RValue => {
            const other = args[0];

            if (other.klass === Integer.klass || other.klass === Float.klass) {
                const other_num = other.get_data<number>();
                const num = self.get_data<number>();

                if (num < other_num) {
                    return Integer.get(-1);
                } else if (num > other_num) {
                    return Integer.get(1);
                } else {
                    return Integer.get(0);
                }
            }

            return Qnil;
        });

        klass.define_native_method("to_f", (self: RValue): RValue => {
            return self;
        });

        klass.define_native_method("to_s", (self: RValue): RValue => {
            const num = self.get_data<number>();

            if (Number.isInteger(num)) {
                return String.new(num.toFixed(1));
            } else {
                return String.new(num.toString());
            }
        });

        klass.define_native_method("%", (self: RValue, args: RValue[]): RValue => {
            const f = self.get_data<number>();
            const r = args[0].get_data<number>();
            return Float.new(f % r);
        });
    });

    inited = true;
};
