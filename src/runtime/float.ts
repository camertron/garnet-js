import { Class, NumericClass, RValue, Runtime, Float, IntegerClass, FloatClass, Qnil } from "../runtime";
import { String } from "../runtime/string";
import { Object } from "../runtime/object";
import { Integer } from "./integer";

let inited = false;

export const init = () => {
    if (inited) return;

    const klass = Object.find_constant("Float")!.get_data<Class>();

    klass.define_native_method("inspect", (self: RValue): RValue => {
        return String.new(self.get_data<number>().toString());
    });

    klass.define_native_method("/", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], NumericClass);
        return Float.new(self.get_data<number>() / args[0].get_data<number>());
    });

    klass.define_native_method("-", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], NumericClass);
        return Float.new(self.get_data<number>() - args[0].get_data<number>());
    });

    klass.define_native_method("round", (self: RValue, args: RValue[]): RValue => {
        const num = self.get_data<number>();
        let ndigits = 0;

        if (args.length > 0) {
            Runtime.assert_type(args[0], IntegerClass);
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

        if (other.klass === IntegerClass || other.klass === FloatClass) {
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

    inited = true;
};
