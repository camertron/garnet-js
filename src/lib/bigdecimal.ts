import { Class, KernelModule, Module, ObjectClass, Runtime, RValue, Qtrue, Qfalse } from "../runtime"
import { Args } from "../runtime/arg-scanner";
import { Integer } from "../runtime/integer";
import { Float } from "../runtime/float";
import { Object as RubyObject } from "../runtime/object";
import { Numeric } from "../runtime/numeric";
import { Rational } from "../runtime/rational";
import { TypeError } from "../errors";
import { RubyString } from "../runtime/string";
import Big from "./big.mjs";
import { Kernel } from "../runtime/kernel";
import { RubyArray } from "../runtime/array";

export class BigDecimal {
    private static klass_: RValue;

    static async new(initial: Big.BigSource, digits?: number): Promise<RValue> {
        return this.subclass_new(await this.klass(), initial, digits);
    }

    static async subclass_new(klass_rval: RValue, value: Big.BigSource, digits?: number): Promise<RValue> {
        return new RValue(klass_rval, new BigDecimal(value, digits));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await RubyObject.find_constant("BigDecimal");
            if (klass) {
                this.klass_ = klass;
            }
        }

        return this.klass_;
    }

    public value: Big.Big;
    public digits: number | undefined;

    constructor(value: Big.BigSource, digits?: number) {
        this.value = new Big(value);
        this.digits = digits;
    }

    to_f(): number {
        return this.value.toNumber();
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    const coerce_to_big_source = async (numeric: RValue): Promise<Big.BigSource> => {
        switch (numeric.klass) {
            case await BigDecimal.klass():
                return numeric.get_data<BigDecimal>().value;
            case await Float.klass():
                return numeric.get_data<number>();
            case await Rational.klass():
                return numeric.get_data<Rational>().to_f();
            case await Integer.klass():
                return numeric.get_data<number>();
            default:
                throw new TypeError(`${numeric.klass.get_data<Class>().full_name} can't be coerced into BigDecimal`);
        }
    }

    Runtime.define_class("BigDecimal", ObjectClass, async (klass: Class): Promise<void> => {
        klass.define_native_method("to_f", (self: RValue): Promise<RValue> => {
            return Float.new(self.get_data<BigDecimal>().to_f());
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return BigDecimal.new(self.get_data<BigDecimal>().value.add(other));
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return BigDecimal.new(self.get_data<BigDecimal>().value.minus(other));
        });

        klass.define_native_method("*", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return BigDecimal.new(self.get_data<BigDecimal>().value.times(other));
        });

        klass.define_native_method("/", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return BigDecimal.new(self.get_data<BigDecimal>().value.div(other));
        });

        klass.define_native_method("**", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Integer.klass());
            const exp = term.get_data<number>();
            return BigDecimal.new(self.get_data<BigDecimal>().value.pow(exp));
        });

        klass.define_native_method("abs", async (self: RValue): Promise<RValue> => {
            return BigDecimal.new(self.get_data<BigDecimal>().value.abs());
        });

        klass.define_native_method("zero?", (self: RValue): RValue => {
            return self.get_data<BigDecimal>().value.eq(0) ? Qtrue : Qfalse;
        });

        klass.define_native_method("<=>", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return Integer.get(self.get_data<BigDecimal>().value.cmp(other));
        });

        klass.define_native_method("<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return self.get_data<BigDecimal>().value.lt(other) ? Qtrue : Qfalse;
        });

        klass.define_native_method("<=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return self.get_data<BigDecimal>().value.lte(other) ? Qtrue : Qfalse;
        });

        klass.define_native_method(">", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return self.get_data<BigDecimal>().value.gt(other) ? Qtrue : Qfalse;
        });

        klass.define_native_method(">=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return self.get_data<BigDecimal>().value.gte(other) ? Qtrue : Qfalse;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const big = self.get_data<BigDecimal>();

            if (big.value.eq(0)) {
                if (big.value.s === 1) {
                    return RubyString.new("0.0");
                } else {
                    return RubyString.new("-0.0");
                }
            }

            const digits = [...big.value.c];

            if (big.digits) {
                while (digits.length < big.digits) {
                    digits.push(0);
                }
            }

            const e = big.value.e + 1;

            return RubyString.new(
                `${big.value.s < 0 ? "-" : ""}0.${digits.join("")}e${e}`
            );
        });

        await klass.alias_method("to_s", "inspect");

        klass.define_native_method("coerce", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);
            const other_coerced = await coerce_to_big_source(other_rval);
            return RubyArray.new([await BigDecimal.new(other_coerced), self]);
        });
    });

    KernelModule.get_data<Module>().define_native_method("BigDecimal", async (_self: RValue, args: RValue[]) => {
        const [initial_rval, digits_rval] = await Args.scan("11", args);

        if (digits_rval) {
            await Runtime.assert_type(digits_rval, await Integer.klass());
        }

        const valid =
            await Kernel.is_a(initial_rval, await RubyString.klass()) ||
            await Kernel.is_a(initial_rval, await Integer.klass()) ||
            await Kernel.is_a(initial_rval, await Float.klass()) ||
            await Kernel.is_a(initial_rval, await BigDecimal.klass());

        if (valid) {
            let initial_val = initial_rval.get_data<string | number | Big.Big>();

            if (typeof initial_val === 'string') {
                initial_val = initial_val.trim();

                if (initial_val.trim().startsWith("+")) {
                    initial_val = initial_val.substring(1);
                }
            }

            const big = new Big(initial_val);
            return BigDecimal.new(big, digits_rval?.get_data<number>());
        } else {
            throw new TypeError(`can't convert ${initial_rval.klass.get_data<Module>().name} into BigDecimal`);
        }
    });

    inited = true;
};
