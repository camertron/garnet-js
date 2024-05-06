import { NameError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../runtime"
import { Object } from "../runtime/object";

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
    });
}
