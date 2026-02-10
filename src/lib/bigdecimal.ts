import { Class, KernelModule, Module, ObjectClass, Runtime, RValue } from "../runtime"
import { Args } from "../runtime/arg-scanner";
import { Integer } from "../runtime/integer";
import { Float } from "../runtime/float";
import { Object } from "../runtime/object";
import { Numeric } from "../runtime/numeric";
import { Rational } from "../runtime/rational";
import { ArgumentError } from "../errors";
import { RubyString } from "../runtime/string";

export class BigDecimal {
    private static klass_: RValue;

    static async new(initial: RValue, digits?: number): Promise<RValue> {
        return this.subclass_new(await this.klass(), initial, digits);
    }

    static subclass_new(klass_rval: RValue, value: RValue, digits?: number): RValue {
        return new RValue(klass_rval, new BigDecimal(value, digits));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("BigDecimal");
            if (klass) {
                this.klass_ = klass;
            }
        }

        return this.klass_;
    }

    public value: RValue;
    public digits: number | undefined;

    constructor(value: RValue, digits?: number) {
        this.value = value;
        this.digits = digits;
    }

    to_f(): number {
        return parseFloat(this.value.get_data());
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    const coerce_to_float = async (numeric: RValue): Promise<number> => {
        switch (numeric.klass) {
            case await BigDecimal.klass():
                return numeric.get_data<BigDecimal>().to_f();
            case await Float.klass():
                return numeric.get_data<number>();
            case await Rational.klass():
                return numeric.get_data<Rational>().to_f();
            case await Integer.klass():
                return numeric.get_data<number>();
            default:
                throw new ArgumentError("Unreachable");
        }
    }

    Runtime.define_class("BigDecimal", ObjectClass, async (klass: Class): Promise<void> => {
        klass.define_native_method("to_f", (self: RValue): Promise<RValue> => {
            // fake it till you make it
            return Float.new(self.get_data<BigDecimal>().to_f());
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());

            const self_f = await coerce_to_float(self);
            const other_f = await coerce_to_float(term);

            return BigDecimal.new(await Float.new(self_f + other_f));
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());

            const self_f = await coerce_to_float(self);
            const other_f = await coerce_to_float(term);

            return BigDecimal.new(await Float.new(self_f - other_f));
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const num = self.get_data<BigDecimal>().to_f();
            const exp = Math.floor(Math.log10(num)) + 1;
            const div = Math.pow(10, exp);
            return await RubyString.new(`${num / div}e${exp}`);
        });
    });

    KernelModule.get_data<Module>().define_native_method("BigDecimal", async (_self: RValue, args: RValue[]) => {
        const [initial_rval, digits_rval] = await Args.scan("11", args);

        if (digits_rval) {
            await Runtime.assert_type(digits_rval, await Integer.klass());
        }

        return await BigDecimal.new(initial_rval, digits_rval ? digits_rval.get_data<number>() : undefined);
    });

    inited = true;
};
