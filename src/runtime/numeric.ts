import { NameError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../runtime"
import { Object } from "../runtime/object";

export class Numeric {
    private static klass_: RValue;

    static get klass(): RValue {
        const klass = Object.find_constant("Numeric");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Numeric`);
        }

        return this.klass_;
    }
}

export const init = () => {
    Runtime.define_class("Numeric", ObjectClass, (klass: Class) => {
        klass.include(Object.find_constant("Comparable")!);
    });
}
