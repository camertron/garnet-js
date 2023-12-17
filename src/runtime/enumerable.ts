import { ExecutionContext } from "../execution_context";
import { Module, Qnil, RValue, Runtime, Object, Proc, NativeCallable, Callable, Array } from "../runtime"

export const init = () => {
    Runtime.define_module("Enumerable", (mod: Module) => {
        mod.define_native_method("map", (self: RValue, _args: RValue[], block?: RValue): RValue => {
            if (block) {
                const results: RValue[] = [];

                Object.send(self, "each", [], new NativeCallable((_self: RValue, args: RValue[]): RValue => {
                    results.push(block.get_data<Callable>().call(ExecutionContext.current, Qnil, args));
                    return Qnil;
                }));

                return Array.new(results);
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });
    });
};
