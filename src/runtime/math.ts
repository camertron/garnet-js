import { Float } from "./float";
import { Integer } from "./integer";
import { Class } from "../runtime";
import { Runtime, Module, RValue } from "../runtime";
import { Args } from "./arg-scanner";
import { Object } from "./object";
import { NameError, RubyError } from "../errors";

let inited = false;

export class RubyMath {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Math");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Math`);
        }

        return this.klass_;
    }
}

export class MathDomainError extends RubyError {
    private static ruby_class_: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Math::DomainError";
    }

    async ruby_class() {
        return MathDomainError.ruby_class_ ||= (await RubyMath.klass()).get_data<Class>().constants["DomainError"];
    }
}

export const init = async () => {
    if (inited) return;

    await Runtime.define_module("Math", async (mod: Module) => {
        mod.define_native_singleton_method("log10", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            const [value_rval] = await Args.scan("1", args);
            await Runtime.assert_type(value_rval, await Integer.klass(), await Float.klass());
            const value = value_rval.get_data<number>();

            if (value === 0.0) {
                return Float.negative_infinity();
            } else if (value === Number.POSITIVE_INFINITY) {
                return Float.positive_infinity();
            } else if (value === Number.NEGATIVE_INFINITY) {
                throw new MathDomainError("Numerical argument is out of domain");
            } else {
                return Float.new(Math.log10(value));
            }
        });

        await Runtime.define_class_under(await RubyMath.klass(), "DomainError", (await Object.find_constant("StandardError"))!);
    });

    inited = true;
};
