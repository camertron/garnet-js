import { Class, IOClass, Qnil, RValue, Runtime } from "../runtime";

let inited = false;

export const init = () => {
    if (inited) return;

    const BasicSocket = Runtime.define_class("BasicSocket", IOClass);
    Runtime.define_class("Socket", BasicSocket, (klass: Class) => {
        klass.define_native_method("close", (): RValue => {
            // no-op for now
            return Qnil;
        });

        klass.define_native_method("timeout", (): RValue => {
            // no-op for now
            return Qnil;
        });
    });

    inited = true;
}
