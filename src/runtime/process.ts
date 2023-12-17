import { isNode } from "../env";
import { Module, RValue, Runtime } from "../runtime"
import { Integer } from "./integer";

let inited = false;

export const init = () => {
    if (inited) return;

    const browserPid = Integer.new(2);

    Runtime.define_module("Process", (mod: Module): void => {
        mod.define_native_singleton_method("pid", (_self: RValue, _args: RValue[]): RValue => {
            if (isNode) {
                return Integer.new(process.pid);
            } else {
                // Just return something other than 0 or 1 for now. Can we run multiple processes
                // in the browser, and if so, does each one get a PID? Unclear.
                return browserPid;
            }
        })
    });

    inited = true;
};
