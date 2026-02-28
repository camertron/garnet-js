import { NameError } from "../errors";
import { Integer, Qnil } from "../garnet";
import { Class, ObjectClass, RValue, Runtime } from "../runtime"
import { Object } from "../runtime/object";
import { Args } from "./arg-scanner";

export class Numeric {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Numeric");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Numeric`);
        }

        return this.klass_;
    }
}

export const init = () => {
    Runtime.define_class("Numeric", ObjectClass, async (klass: Class) => {
        klass.include((await Object.find_constant("Comparable"))!);

        // This is just the base implementation of Numeric#<=>. Integer, Float, etc
        // define more correct versions for those types.
        klass.define_native_method("<=>", async (self: RValue, args: RValue[]) => {
            const [other_rval] = await Args.scan("1", args);

            if (self === other_rval) {
                return await Integer.get(0);
            }

            return Qnil;
        });
    });
}
