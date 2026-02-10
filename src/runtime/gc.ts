import { Runtime, Module, Qnil, RValue } from "../runtime";

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_module("GC", (mod: Module) => {
      mod.define_native_singleton_method("start", (): RValue => {
        // Do nothing. I'm pretty sure this is not possible in nodejs without a special runtime flag,
        // and definitely not possible in browsers.
        return Qnil;
      });
    });
};
