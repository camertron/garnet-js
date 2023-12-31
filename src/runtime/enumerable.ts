import { BlockCallData } from "../call_data";
import { BreakError, ExecutionContext } from "../execution_context";
import { Module, Qnil, RValue, Runtime, NativeCallable, Callable, Array, Qfalse, Qtrue } from "../runtime"
import { Object } from "./object";
import { Proc } from "./proc";

export const init = () => {
    Runtime.define_module("Enumerable", (mod: Module) => {
        mod.define_native_method("map", (self: RValue, _args: RValue[], block?: RValue): RValue => {
            if (block) {
                const results: RValue[] = [];
                const proc = block.get_data<Proc>();

                Object.send(self, "each", [], Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                    results.push(proc.call(ExecutionContext.current, args));
                    return Qnil;
                }));

                return Array.new(results);
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        mod.define_native_method("find", (self: RValue, _args: RValue[], block?: RValue): RValue => {
            if (block) {
                try {
                    const proc = block.get_data<Proc>();

                    Object.send(self, "each", [], Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                        if (proc.call(ExecutionContext.current, args).is_truthy()) {
                            throw new BreakError(args[0]);
                        }

                        return Qnil;
                    }));

                    // no match found
                    return Qnil;
                } catch (e) {
                    if (e instanceof BreakError) {
                        // match found, return value
                        return e.value;
                    } else {
                        // an error occurred
                        throw e;
                    }
                }
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        mod.define_native_method("any?", (self: RValue, _args: RValue[], block?: RValue): RValue => {
            try {
                const proc = block ? block.get_data<Proc>() : null;

                Object.send(self, "each", [], Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                    const item = proc ? proc.call(ExecutionContext.current, args) : args[0];

                    if (item.is_truthy()) {
                        throw new BreakError(Qtrue);
                    }

                    return Qnil;
                }));

                // no match found
                return Qfalse;
            } catch (e) {
                if (e instanceof BreakError) {
                    // match found, return value
                    return e.value;
                } else {
                    // an error occurred
                    throw e;
                }
            }
        });
    });
};
