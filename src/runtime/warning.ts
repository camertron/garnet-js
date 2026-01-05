import { IO, Module, Qnil, Runtime, RValue, STDERR } from "../runtime"
import { Args } from "./arg-scanner";

let inited = false;

export const warn = (msg: string) => {
  STDERR.get_data<IO>().write(msg);
}

export const init = () => {
    if (inited) return;

    Runtime.define_module("Warning", async (mod: Module): Promise<void> => {
      // ignoring categories for now because I don't understand how they work or what they do
      mod.define_native_method("warn", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const [data] = await Args.scan("1", args);
        const data_str = await Runtime.coerce_to_string(data);
        warn(data_str.get_data<string>());
        return Qnil;
      });

      mod.extend(mod.rval);
    });

    inited = true;
};
