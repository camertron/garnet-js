import { ArgumentError, NameError, RangeError } from "../errors";
import { Class, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { obj_id_hash } from "../util/object_id";
import { Encoding } from "./encoding";
import { RubyString } from "../runtime/string";
import { Object } from "../runtime/object";
import { Rational } from "./rational";
import { Numeric } from "./numeric";
import { Float } from "./float";
import { Proc } from "./proc";
import { Hash } from "./hash";
import { BreakError, ExecutionContext, NextError } from "../execution_context";
import { Args } from "./arg-scanner";

export class Integer {
    static INT2FIX0: RValue;
    static INT2FIX1: RValue;
    static INT2FIXN1: RValue;

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Integer");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Integer`);
        }

        return this.klass_;
    }

    static async new(value: number): Promise<RValue> {
        if (isNaN(value)) {
            throw new ArgumentError("value is NaN");
        }

        return new RValue(await this.klass(), value);
    }

    static async get(value: number): Promise<RValue> {
        if (value === 0) {
            return Integer.INT2FIX0;
        } else if (value === 1) {
            return Integer.INT2FIX1;
        } else if (value === -1) {
            return Integer.INT2FIXN1;
        } else {
            return await Integer.new(value);
        }
    }
}

let inited = false;

export const init = async () => {
    if (inited) return

    Runtime.define_class("Integer", await Numeric.klass(), (klass: Class) => {
        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<number>().toString());
        });

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            return await RubyString.new(self.get_data<number>().toString());
        });

        klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
            return await Integer.get(obj_id_hash(self.object_id));
        });

        // Normally multiplication of two ints/floats is handled by the opt_mult instruction. This
        // definition is here for the sake of completeness.
        klass.define_native_method("*", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const multiplier = args[0];
            await Runtime.assert_type(multiplier, await Numeric.klass());

            const self_num = self.get_data<number>();

            switch (multiplier.klass) {
                case await Float.klass():
                    return Float.new(self_num * multiplier.get_data<number>());
                case await Rational.klass():
                    const rational = multiplier.get_data<Rational>();
                    return Rational.new(
                        rational.s * self_num * rational.n,
                        rational.d,
                    )
                case await Integer.klass():
                    return Integer.get(Math.floor(self_num * multiplier.get_data<number>()));
                default:
                    throw new ArgumentError("Unreachable");
            }
        });

        klass.define_native_method("/", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const divisor = args[0];
            await Runtime.assert_type(divisor, await Numeric.klass());

            const result = self.get_data<number>() / divisor.get_data<number>();

            if (divisor.klass === await Float.klass()) {
                return await Float.new(result);
            } else {
                return await Integer.get(Math.floor(result));
            }
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const term = args[0];
            await Runtime.assert_type(term, await Numeric.klass());

            const self_num = self.get_data<number>();

            switch (term.klass) {
                case await Float.klass():
                    return Float.new(self.get_data<number>() + term.get_data<number>());
                case await Rational.klass():
                    const rational = term.get_data<Rational>();
                    return Rational.new(
                        (self_num * rational.d) + rational.n,
                        rational.d
                    );
                case await Integer.klass():
                    return Integer.get(Math.floor(self.get_data<number>() + term.get_data<number>()));
                default:
                    throw new ArgumentError("Unreachable");
            }
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const term = args[0];
            await Runtime.assert_type(term, await Numeric.klass());

            const self_num = self.get_data<number>();

            switch (term.klass) {
                case await Float.klass():
                    return Float.new(self.get_data<number>() - term.get_data<number>());
                case await Rational.klass():
                    const rational = term.get_data<Rational>();
                    return Rational.new(
                        (self_num * rational.d) - rational.n,
                        rational.d
                    );
                case await Integer.klass():
                    return Integer.get(Math.floor(self.get_data<number>() - term.get_data<number>()));
                default:
                    throw new ArgumentError("Unreachable");
            }
        });

        klass.define_native_method("%", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const divisor = args[0];
            await Runtime.assert_type(divisor, await Numeric.klass());

            const result = self.get_data<number>() % divisor.get_data<number>();

            if (divisor.klass === await Float.klass()) {
                return Float.new(result);
            } else {
                return Integer.get(result);
            }
        });

        klass.define_native_method("**", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const term = args[0];
            await Runtime.assert_type(term, await Numeric.klass());

            const result = Math.pow(self.get_data<number>(), term.get_data<number>());

            if (term.klass === await Float.klass()) {
                return Float.new(result);
            } else {
                return Integer.get(Math.floor(result));
            }
        });

        klass.define_native_method("-@", async (self: RValue): Promise<RValue> => {
            return await Integer.get(-self.get_data<number>());
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

        klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
            const num = self.get_data<number>();
            const other_num = args[0].get_data<number>();
            return num === other_num ? Qtrue : Qfalse;
        });

        klass.define_native_method("to_i", (self: RValue): RValue => {
            return self;
        });

        klass.define_native_method("to_f", async (self: RValue): Promise<RValue> => {
            return await Float.new(self.get_data<number>());
        });

        klass.define_native_method("even?", (self: RValue): RValue => {
            return self.get_data<number>() % 2 == 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("odd?", (self: RValue): RValue => {
            return self.get_data<number>() % 2 == 1 ? Qtrue : Qfalse;
        });

        klass.define_native_method("zero?", (self: RValue): RValue => {
            return self.get_data<number>() === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("size", async (self: RValue): Promise<RValue> => {
            // all numbers in js are 64-bit floats
            return await Integer.get(8);
        });

        klass.define_native_method("chr", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<number>();
            const encoding_rval = args[0] || Encoding.us_ascii;
            const encoding = encoding_rval.get_data<Encoding>();

            if (encoding.codepoint_valid(data)) {
                const str = await RubyString.new(encoding.codepoint_to_utf16(data));
                RubyString.set_encoding(str, encoding_rval);
                return str;
            } else {
                throw new RangeError(`${data} out of char range`);
            }
        });

        klass.define_native_method("abs", async (self: RValue): Promise<RValue> => {
            return await Integer.get(Math.abs(self.get_data<number>()));
        });

        klass.define_native_method("upto", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const [limit_arg] = await Args.scan("1", args);
            await Runtime.assert_type(limit_arg, await Integer.klass());
            const limit = limit_arg.get_data<number>();

            if (block) {
                try {
                    const proc = block.get_data<Proc>();

                    for (let i = self.get_data<number>(); i <= limit; i ++) {
                        try {
                            await proc.call(ExecutionContext.current, [await Integer.get(i)]);
                        } catch (e) {
                            // swallow NextErrors and keep going
                            if (!(e instanceof NextError)) {
                                throw e;
                            }
                        }
                    }

                    return self;
                } catch (e) {
                    if (e instanceof BreakError) {
                        return e.value;
                    } else {
                        throw e;
                    }
                }
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });
    });

    Integer.INT2FIX0 = await Integer.new(0);
    Integer.INT2FIX1 = await Integer.new(1);
    Integer.INT2FIXN1 = await Integer.new(-1);

    inited = true;
};
