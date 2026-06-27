import { Class, KernelModule, Module, ObjectClass, Runtime, RValue, Qtrue, Qfalse, Qnil } from "../runtime"
import { Args } from "../runtime/arg-scanner";
import { Integer } from "../runtime/integer";
import { Float } from "../runtime/float";
import { Object as RubyObject } from "../runtime/object";
import { Numeric } from "../runtime/numeric";
import { Rational } from "../runtime/rational";
import { ArgumentError, FloatDomainError, TypeError } from "../errors";
import { RubyString } from "../runtime/string";
import Big from "./big.mjs";
import { Kernel } from "../runtime/kernel";
import { RubyArray } from "../runtime/array";
import { MathDomainError } from "../runtime/math";

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
        if (typeof value === "object") {
            this.value = value as Big.Big;
        } else {
            try {
                this.value = new Big(value);
            } catch (e) {
                if (e instanceof Error && e.message === "[big.js] Invalid number") {
                    throw new ArgumentError(`invalid value for BigDecimal(): "${value}"`);
                }

                throw e;
            }
        }

        this.digits = digits;
    }

    to_f(): number {
        return this.value.toNumber();
    }
}

class BigDecimalNaN extends BigDecimal {
    private static _instance: BigDecimalNaN;
    private static _instance_rval: RValue;

    static instance(): BigDecimalNaN {
        if (!BigDecimalNaN._instance) {
            BigDecimalNaN._instance = new BigDecimalNaN(BigNaN.instance());
        }

        return BigDecimalNaN._instance;
    }

    static async instance_rval(): Promise<RValue> {
        if (!BigDecimalNaN._instance_rval) {
            BigDecimalNaN._instance_rval = new RValue(await BigDecimal.klass(), BigDecimalNaN.instance());
        }

        return BigDecimalNaN._instance_rval;
    }

    to_f(): number {
        return NaN;
    }
}

const big_source_to_big = (src: Big.BigSource): Big.Big => {
    if (typeof src === "string") {
        if (src === "Infinity") {
            return BigPositiveInfinity.instance();
        } else if (src === "-Infinity") {
            return BigNegativeInfinity.instance();
        } else if (src === "NaN") {
            return BigNaN.instance();
        }
    } else if (typeof src !== "number") {
        return src;
    }

    return new Big(src);
}

class BigNaN implements Big.Big {
    private static _instance: BigNaN;

    static instance(): BigNaN {
        if (!BigNaN._instance) {
            BigNaN._instance = new BigNaN();
        }

        return BigNaN._instance;
    }

    abs(): Big.Big {
        return BigNaN.instance();
    }

    add(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    cmp(_n: Big.BigSource): Big.Comparison {
        // fake it till you make it
        return null as unknown as Big.Comparison;
    }

    div(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    eq(n: Big.BigSource): boolean {
        return n === "NaN" || n === BigNaN.instance();
    }

    gt(_n: Big.BigSource): boolean {
        return false;
    }

    gte(_n: Big.BigSource): boolean {
        return false;
    }

    lt(_n: Big.BigSource): boolean {
        return false;
    }

    lte(_n: Big.BigSource): boolean {
        return false;
    }

    minus(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    mod(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    mul(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    neg(): Big.Big {
        return BigNaN.instance();
    }

    plus(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    pow(_exp: number): Big.Big {
        return BigNaN.instance();
    }

    prec(_sd: number, _rm?: Big.RoundingMode): Big.Big {
        return BigNaN.instance();
    }

    round(_dp?: number, _rm?: Big.RoundingMode): Big.Big {
        return BigNaN.instance();
    }

    sqrt(): Big.Big {
        return BigNaN.instance();
    }

    sub(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    times(_n: Big.BigSource): Big.Big {
        return BigNaN.instance();
    }

    toExponential(_dp?: number, _rm?: Big.RoundingMode): string {
        return "NaN";
    }

    toFixed(_dp?: number, _rm?: Big.RoundingMode): string {
        return "NaN";
    }

    toPrecision(_sd?: number, _rm?: Big.RoundingMode): string {
        return "NaN";
    }

    toString(): string {
        return "NaN";
    }

    toNumber(): number {
        throw new FloatDomainError("Computation results in 'NaN' (Not a Number)");
    }

    valueOf(): string {
        return "NaN";
    }

    toJSON(): string {
        throw new Error("Method not implemented.");
    }

    c: number[];
    e: number;
    s: number;
}

abstract class BigInfinity implements Big.Big {
    abs(): Big.Big {
        return BigPositiveInfinity.instance();
    }

    add(_n: Big.BigSource): Big.Big {
        return this;
    }

    abstract cmp(n: Big.BigSource): Big.Comparison;
    abstract sqrt(): Big.Big;
    abstract toExponential(dp?: number, rm?: Big.RoundingMode): string;
    abstract toFixed(dp?: number, rm?: Big.RoundingMode): string;
    abstract toPrecision(sd?: number, rm?: Big.RoundingMode): string;
    abstract toString(): string;
    abstract valueOf(): string;

    div(n: Big.BigSource): Big.Big {
        const sign = this.s / new Big.Big(n).s;
        return sign < 0 ? BigNegativeInfinity.instance() : BigPositiveInfinity.instance();
    }

    eq(n: Big.BigSource): boolean {
        return this.cmp(big_source_to_big(n)) === 0;
    }

    gt(n: Big.BigSource): boolean {
        return this.cmp(big_source_to_big(n)) > 0;
    }

    gte(n: Big.BigSource): boolean {
        return this.cmp(big_source_to_big(n)) >= 0;
    }

    lt(n: Big.BigSource): boolean {
        return this.cmp(big_source_to_big(n)) < 0;
    }

    lte(n: Big.BigSource): boolean {
        return this.cmp(big_source_to_big(n)) <= 0;
    }

    minus(n: Big.BigSource): Big.Big {
        return this;
    }

    mod(n: Big.BigSource): Big.Big {
        // (+-)Infinity % n == NaN
        return BigNaN.instance();
    }

    mul(n: Big.BigSource): Big.Big {
        return this.times(n);
    }

    neg(): Big.Big {
        const sign = this.s * -1;
        return sign < 0 ? BigNegativeInfinity.instance() : BigPositiveInfinity.instance();
    }

    plus(n: Big.BigSource): Big.Big {
        return this;
    }

    pow(exp: number): Big.Big {
        return this;
    }

    prec(sd: number, rm?: Big.RoundingMode): Big.Big {
        return this;
    }

    round(dp?: number, rm?: Big.RoundingMode): Big.Big {
        return this;
    }

    sub(n: Big.BigSource): Big.Big {
        return this;
    }

    times(n: Big.BigSource): Big.Big {
        const sign = this.s * new Big.Big(n).s;
        return sign < 0 ? BigNegativeInfinity.instance() : BigPositiveInfinity.instance();
    }

    toNumber(): number {
        throw new FloatDomainError("Computation results in 'NaN' (Not a Number)");
    }

    toJSON(): string {
        throw new Error("Method not implemented.");
    }

    c: number[];
    e: number;
    s: number;
}

class BigPositiveInfinity extends BigInfinity {
    public value: number = Infinity;
    private static _instance: BigPositiveInfinity;

    static instance(): BigPositiveInfinity {
        if (!BigPositiveInfinity._instance) {
            BigPositiveInfinity._instance = new BigPositiveInfinity();
            BigPositiveInfinity._instance.s = 1;
        }

        return BigPositiveInfinity._instance;
    }

    cmp(n: Big.BigSource): Big.Comparison {
        const other = big_source_to_big(n);

        if (other === BigPositiveInfinity.instance()) {
            return 0;
        } else if (other === BigNaN.instance()) {
            return null as unknown as Big.Comparison;
        } else {
            return 1;
        }
    }

    sqrt(): Big.Big {
        return this;
    }

    toExponential(dp?: number, rm?: Big.RoundingMode): string {
        return "Infinity";
    }

    toFixed(dp?: number, rm?: Big.RoundingMode): string {
        return "Infinity";
    }

    toPrecision(sd?: number, rm?: Big.RoundingMode): string {
        return "Infinity";
    }

    toString(): string {
        return "Infinity";
    }

    valueOf(): string {
        return "Infinity";
    }
}

class BigNegativeInfinity extends BigInfinity {
    public value: number = Number.NEGATIVE_INFINITY;
    private static _instance: BigNegativeInfinity;

    static instance(): BigNegativeInfinity {
        if (!BigNegativeInfinity._instance) {
            BigNegativeInfinity._instance = new BigNegativeInfinity();
            BigNegativeInfinity._instance.s = -1;
        }

        return BigNegativeInfinity._instance;
    }

    cmp(n: Big.BigSource): Big.Comparison {
        const other = big_source_to_big(n);

        if (other === BigNegativeInfinity.instance()) {
            return 0;
        } else if (other === BigNaN.instance()) {
            return null as unknown as Big.Comparison;
        } else {
            return -1;
        }
    }

    sqrt(): Big.Big {
        throw new MathDomainError("Numerical argument is out of domain - sqrt");
    }

    toExponential(dp?: number, rm?: Big.RoundingMode): string {
        return "-Infinity";
    }

    toFixed(dp?: number, rm?: Big.RoundingMode): string {
        return "-Infinity";
    }

    toPrecision(sd?: number, rm?: Big.RoundingMode): string {
        return "-Infinity";
    }

    toString(): string {
        return "-Infinity";
    }

    valueOf(): string {
        return "-Infinity";
    }
}

class BigDecimalPositiveInfinity extends BigDecimal {
    private static _instance: BigDecimalPositiveInfinity;
    private static _instance_rval: RValue;

    static instance(): BigDecimalPositiveInfinity {
        if (!BigDecimalPositiveInfinity._instance) {
            BigDecimalPositiveInfinity._instance = new BigDecimalPositiveInfinity(
                BigPositiveInfinity.instance()
            );
        }

        return BigDecimalPositiveInfinity._instance;
    }

    static async instance_rval(): Promise<RValue> {
        if (!BigDecimalPositiveInfinity._instance_rval) {
            BigDecimalPositiveInfinity._instance_rval = new RValue(
                await BigDecimal.klass(), BigDecimalPositiveInfinity.instance()
            );
        }

        return BigDecimalPositiveInfinity._instance_rval;
    }

    to_f(): number {
        return Infinity;
    }
}

class BigDecimalNegativeInfinity extends BigDecimal {
    private static _instance: BigDecimalNegativeInfinity;
    private static _instance_rval: RValue;

    static instance(): BigDecimalNegativeInfinity {
        if (!BigDecimalNegativeInfinity._instance) {
            BigDecimalNegativeInfinity._instance = new BigDecimalNegativeInfinity(
                BigNegativeInfinity.instance()
            );
        }

        return BigDecimalNegativeInfinity._instance;
    }

    static async instance_rval(): Promise<RValue> {
        if (!BigDecimalNegativeInfinity._instance_rval) {
            BigDecimalNegativeInfinity._instance_rval = new RValue(
                await BigDecimal.klass(), BigDecimalNegativeInfinity.instance()
            );
        }

        return BigDecimalNegativeInfinity._instance_rval;
    }

    to_f(): number {
        return Number.NEGATIVE_INFINITY;
    }
}

let inited = false;

export const init = async () => {
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

    await Runtime.define_class("BigDecimal", ObjectClass, async (klass: Class): Promise<void> => {
        const sign_nan = klass.constants["SIGN_NaN"] = await Integer.get(0);
        const sign_positive_zero = klass.constants["SIGN_POSITIVE_ZERO"] = await Integer.get(1);
        const sign_negative_zero = klass.constants["SIGN_NEGATIVE_ZERO"] = await Integer.get(-1);
        const sign_positive_finite = klass.constants["SIGN_POSITIVE_FINITE"] = await Integer.get(2);
        const sign_negative_finite = klass.constants["SIGN_NEGATIVE_FINITE"] = await Integer.get(-2);
        const sign_positive_infinite = klass.constants["SIGN_POSITIVE_INFINITE"] = await Integer.get(3);
        const sign_negative_infinite = klass.constants["SIGN_NEGATIVE_INFINITE"] = await Integer.get(-3);

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
            const result = self.get_data<BigDecimal>().value.cmp(other);

            // BigNaN#<=> can return null
            if (!result) {
                return Qnil;
            } else {
                return Integer.get(self.get_data<BigDecimal>().value.cmp(other));
            }
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

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [term] = await Args.scan("1", args);
            await Runtime.assert_type(term, await Numeric.klass(), await BigDecimal.klass());
            const other = await coerce_to_big_source(term);
            return self.get_data<BigDecimal>().value.eq(other) ? Qtrue : Qfalse;
        });

        klass.define_native_method("nan?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return self.get_data<BigDecimal>().value === BigNaN.instance() ? Qtrue : Qfalse;
        });

        klass.define_native_method("sign", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const big = self.get_data<BigDecimal>().value;

            if (big === BigPositiveInfinity.instance()) {
                return sign_positive_infinite;
            } else if (big === BigNegativeInfinity.instance()) {
                return sign_negative_infinite;
            } else if (big === BigNaN.instance()) {
                return sign_nan;
            } else if (big.eq(0)) {
                return sign_positive_zero;
            } else {
                return big.lt(0) ? sign_negative_finite : sign_positive_finite;
            }
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const big = self.get_data<BigDecimal>();

            if (big.value === BigPositiveInfinity.instance()) {
                return RubyString.new("Infinity");
            } else if (big.value === BigNegativeInfinity.instance()) {
                return RubyString.new("-Infinity");
            } else if (big.value === BigNaN.instance()) {
                return RubyString.new("NaN");
            }

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

            switch (initial_val) {
                case "NaN":
                    return await BigDecimalNaN.instance_rval();
                case "Infinity":
                    return await BigDecimalPositiveInfinity.instance_rval();
                case "-Infinity":
                    return await BigDecimalNegativeInfinity.instance_rval();
            }

            if (typeof initial_val === 'string') {
                initial_val = initial_val.trim();

                if (initial_val.trim().startsWith("+")) {
                    initial_val = initial_val.substring(1);
                }
            }

            return BigDecimal.new(initial_val, digits_rval?.get_data<number>());
        } else {
            throw new TypeError(`can't convert ${initial_rval.klass.get_data<Module>().name} into BigDecimal`);
        }
    });

    inited = true;
};
