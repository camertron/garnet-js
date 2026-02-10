import { Class, RValue, Runtime, Qnil, ObjectClass, Qtrue, Qfalse } from "../runtime";
import { RubyString } from "../runtime/string";
import { Object } from "../runtime/object";
import { Integer } from "./integer";
import { Numeric } from "./numeric";
import { NameError } from "../errors";

export class Float {
    private static klass_: RValue;

    static async new(value: number): Promise<RValue> {
        return new RValue(await this.klass(), value);
    }

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Float");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Float`);
        }

        return this.klass_;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Float", await Numeric.klass(), (klass: Class) => {
        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<number>().toString());
        });

        klass.define_native_method("/", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Numeric.klass());
            return await Float.new(self.get_data<number>() / args[0].get_data<number>());
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Numeric.klass());
            return await Float.new(self.get_data<number>() + args[0].get_data<number>());
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Numeric.klass());
            return await Float.new(self.get_data<number>() - args[0].get_data<number>());
        });

        klass.define_native_method("*", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Numeric.klass());
            return await Float.new(self.get_data<number>() * args[0].get_data<number>());
        });

        klass.define_native_method("**", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Numeric.klass());
            return await Float.new(Math.pow(self.get_data<number>(), args[0].get_data<number>()));
        });

        klass.define_native_method("round", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const num = self.get_data<number>();
            let ndigits = 0;

            if (args.length > 0) {
                await Runtime.assert_type(args[0], await Integer.klass());
                ndigits = args[0].get_data<number>();
            }

            if (ndigits === 0) {
                return Integer.get(Math.round(num));
            } else if (ndigits > 0) {
                const multiplier = Math.pow(10, ndigits);
                return await Float.new(Math.round((num + Number.EPSILON) * multiplier) / multiplier);
            } else {
                const multiplier = Math.pow(10, Math.abs(ndigits));
                return Integer.get(Math.round(num / multiplier) * multiplier);
            }
        });

        klass.define_native_method("<=>", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const other = args[0];

            if (other.klass === await Integer.klass() || other.klass === await Float.klass()) {
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

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            const num = self.get_data<number>();

            if (Number.isInteger(num)) {
                return await RubyString.new(num.toFixed(1));
            } else {
                return await RubyString.new(num.toString());
            }
        });

        klass.define_native_method("%", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const f = self.get_data<number>();
            const r = args[0].get_data<number>();
            return await Float.new(f % r);
        });

        klass.define_native_method("zero?", (self: RValue): RValue => {
            const f = self.get_data<number>();
            return f === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("abs", async (self: RValue): Promise<RValue> => {
            return await Integer.get(Math.abs(self.get_data<number>()));
        });
    });

    inited = true;
};
