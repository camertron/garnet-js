import { is_node } from "../env";
import { ErrnoEINVAL } from "../errors";
import { Module, RValue, Runtime } from "../runtime"
import { Float } from "./float";
import { Integer } from "./integer";

let inited = false;

export const init = () => {
    if (inited) return;

    const browserPid = Integer.new(2);

    Runtime.define_module("Process", async (mod: Module): Promise<void> => {
        // really just an arbitrary value, 6 is what MRI returned on my system
        mod.constants["CLOCK_MONOTONIC"] = await Integer.get(6);

        mod.define_native_singleton_method("pid", async (_self: RValue, _args: RValue[]): Promise<RValue> => {
            if (is_node) {
                return await Integer.new(process.pid);
            } else {
                // Just return something other than 0 or 1 for now. Can we run multiple processes
                // in the browser, and if so, does each one get a PID? Unclear.
                return browserPid;
            }
        });

        mod.define_native_singleton_method("clock_gettime", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0] === mod.constants["CLOCK_MONOTONIC"]) {
                return await Float.new(performance.now() / 1000);
            } else {
                await Runtime.assert_type(args[0], await Integer.klass());
                const clock_num = args[0].get_data<number>();
                throw new ErrnoEINVAL(`Invalid argument - clock_gettime(${clock_num})`);
            }
        });
    });

    inited = true;
};
