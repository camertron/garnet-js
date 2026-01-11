import { Class, ObjectClass, RValue, Runtime } from "../runtime"
import { Object } from "../runtime/object";

export class Argf {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        this.klass_ = (await Object.find_constant("ARGF.class"))!;
        return this.klass_;
    }

    public argf: RValue[];

    static async new(argv: RValue[]): Promise<RValue> {
        return new RValue(await Argf.klass(), new Argf(argv));
    }

    constructor(argf: RValue[]) {
        this.argf = argf;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("ARGF.class", ObjectClass, (klass: Class) => {
    });

    inited = true;
};
