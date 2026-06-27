import { Class, IOClass, Qnil, RValue, Runtime } from "../runtime";

let inited = false;

export const init = async () => {
    if (inited) return;

    const BasicSocket = await Runtime.define_class("BasicSocket", IOClass);
    await Runtime.define_class("Socket", BasicSocket, async (klass: Class) => {
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
