import { Class, ObjectClass, Runtime } from "../runtime";

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringScanner", ObjectClass, async (klass: Class) => {
    });

    inited = true;
}
