import { Module, RValue, Runtime } from "../runtime"
import { is_node } from "../env";
import { Integer } from "../runtime/integer";

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_module("Etc", async (mod: Module) => {
        mod.define_native_singleton_method("nprocessors", async (): Promise<RValue> => {
          if (is_node) {
            const os = await import("os");
            return await Integer.get(os.availableParallelism());
          } else {
            return await Integer.get(1);
          }
        });
    });

    inited = true;
};
