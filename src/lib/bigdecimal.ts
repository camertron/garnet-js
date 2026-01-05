import { Class, ObjectClass, Runtime, RValue } from "../runtime"
import { Object } from "../runtime/object";

export class BigDecimal {
    private static klass_: RValue;

    static async new(path: string): Promise<RValue> {
        return this.subclass_new(await this.klass(), path);
    }

    static subclass_new(klass_rval: RValue, value: string): RValue {
        return new RValue(klass_rval, new BigDecimal(value));
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

    public value: string;

    constructor(value: string) {
        this.value = value;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("BigDecimal", ObjectClass, async (klass: Class): Promise<void> => {
    });

    inited = true;
};
