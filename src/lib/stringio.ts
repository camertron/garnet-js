import { Class, Object, Runtime } from "../garnet";
import { ObjectClass, RValue } from "../runtime";

let inited = false;

export class StringIO {
    static new() {
        return new RValue(Object.find_constant("StringIO")!, "");
    }
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringIO", ObjectClass, (klass: Class) => {
        // @TODO: also include IO::generic_readable and IO::generic_writable
        klass.include(Object.find_constant("Enumerable")!);

        // klass.define_native_method("append", (self: RValue, args: RValue[]): RValue => {

        // });
    });

    inited = true;
}
