import { Class, RValue, Runtime, Qnil, ObjectClass, Qtrue, Qfalse } from "../runtime";
import { RubyString } from "../runtime/string";
import { Object } from "../runtime/object";
import { Integer } from "./integer";
import { Numeric } from "./numeric";
import { NameError } from "../errors";
import { Args } from "./arg-scanner";
import { Kernel } from "./kernel";
import { RubyArray } from "./array";
import { Rational } from "./rational";

export class Float {
    private static klass_: RValue;
    private static POSITIVE_INFINITY: RValue;
    private static NEGATIVE_INFINITY: RValue;

    static async new(value: number): Promise<RValue> {
        if (value === Number.POSITIVE_INFINITY) {
            return Float.positive_infinity();
        } else if (value === Number.NEGATIVE_INFINITY) {
            return Float.negative_infinity();
        } else {
            return new RValue(await this.klass(), value);
        }
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

    static async positive_infinity(): Promise<RValue> {
        if (!Float.POSITIVE_INFINITY) {
            Float.POSITIVE_INFINITY = new RValue(await this.klass(), Number.POSITIVE_INFINITY);
        }

        return Float.POSITIVE_INFINITY;
    }

    static async negative_infinity(): Promise<RValue> {
        if (!Float.NEGATIVE_INFINITY) {
            Float.NEGATIVE_INFINITY = new RValue(await this.klass(), Number.NEGATIVE_INFINITY);
        }

        return Float.NEGATIVE_INFINITY;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    const float_klass = Runtime.define_class("Float", await Numeric.klass(), (klass: Class) => {
        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            let str = self.get_data<number>().toString();

            if (str.indexOf(".") === -1) {
                // Check if it's in exponential notation (e.g., "5e-20")
                const eIndex = str.search(/e/i);
                if (eIndex !== -1) {
                    // Insert ".0" before the "e"
                    str = str.substring(0, eIndex) + ".0" + str.substring(eIndex);
                } else {
                    // Regular number without decimal point
                    str = `${str}.0`;
                }
            }

            return await RubyString.new(str);
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
            const [other_rval] = await Args.scan("1", args);

            if (other_rval.klass === await Integer.klass() || other_rval.klass === await Float.klass()) {
                const other_num = other_rval.get_data<number>();
                const num = self.get_data<number>();

                if (num < other_num) {
                    return Integer.get(-1);
                } else if (num > other_num) {
                    return Integer.get(1);
                } else {
                    return Integer.get(0);
                }
            }

            if (await Object.respond_to(other_rval, "coerce")) {
                const coerced = await Object.send(other_rval, "coerce", [self]);

                if (!await Kernel.is_a(coerced, await RubyArray.klass())) {
                    throw new TypeError("coerce must return [x, y]");
                }

                const coerced_elems = coerced.get_data<RubyArray>().elements;

                if (coerced_elems.length !== 2) {
                    throw new TypeError("coerce must return [x, y]");
                }

                const [coerced_self, coerced_other] = coerced_elems;

                return Object.send(coerced_self, "<=>", [coerced_other]);
            }

            return Qnil;
        });

        klass.define_native_method("coerce", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);
            let other;

            switch (other_rval.klass) {
                case await Float.klass():
                    other = other_rval.get_data<number>();
                    break;
                case await Rational.klass():
                    other = other_rval.get_data<Rational>().to_f();
                    break;
                case await Integer.klass():
                    other = other_rval.get_data<number>();
                    break;
                default:
                    throw new TypeError(`${other_rval.klass.get_data<Class>().full_name} can't be coerced into Float`);
            }

            return RubyArray.new([await Float.new(other), self]);
        });

        klass.define_native_method("to_f", (self: RValue): RValue => {
            return self;
        });

        klass.define_native_method("to_i", async (self: RValue): Promise<RValue> => {
            return await Integer.get(Math.trunc(self.get_data<number>()));
        });

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            const num = self.get_data<number>();

            if (Number.isInteger(num)) {
                return await RubyString.new(num.toFixed(1));
            } else {
                let str = num.toString();

                // Handle exponential notation: ensure there's a decimal point before the 'e'
                if (str.indexOf(".") === -1) {
                    const eIndex = str.search(/e/i);
                    if (eIndex !== -1) {
                        // Insert ".0" before the "e"
                        str = str.substring(0, eIndex) + ".0" + str.substring(eIndex);
                    }
                }

                return await RubyString.new(str);
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
            return await Float.new(Math.abs(self.get_data<number>()));
        });

        klass.define_native_method("-@", async (self: RValue): Promise<RValue> => {
            return await Float.new(-self.get_data<number>());
        });
    });

    float_klass.get_data<Class>().constants["INFINITY"] = await Float.positive_infinity();

    inited = true;
};
