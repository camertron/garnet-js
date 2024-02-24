import { ArgumentError } from "../errors";
import { BreakError, ExecutionContext } from "../execution_context";
import { Module, Qnil, RValue, Runtime, Array, Qfalse, Qtrue, Kwargs } from "../runtime"
import { spaceship_compare } from "./comparable";
import { Object } from "./object";
import { Proc } from "./proc";

export const init = () => {
    Runtime.define_module("Enumerable", (mod: Module) => {
        mod.define_native_method("map", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            if (block) {
                const results: RValue[] = [];
                const proc = block.get_data<Proc>();

                Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[], kwargs?: Kwargs): RValue => {
                    results.push(proc.call(ExecutionContext.current, args, kwargs));
                    return Qnil;
                }));

                return Array.new(results);
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        mod.define_native_method("find", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            if (block) {
                try {
                    const proc = block.get_data<Proc>();

                    Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
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

        mod.define_native_method("any?", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            try {
                const proc = block ? block.get_data<Proc>() : null;

                Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
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

        mod.define_native_method("partition", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            if (block) {
                const proc = block.get_data<Proc>();
                const truthy_array: RValue[] = [];
                const falsey_array: RValue[] = [];

                Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                    const key = proc.call(ExecutionContext.current, args);

                    if (key.is_truthy()) {
                        truthy_array.push(args[0]);
                    } else {
                        falsey_array.push(args[0]);
                    }

                    return Qnil;
                }));

                return Array.new([Array.new(truthy_array), Array.new(falsey_array)]);
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        mod.define_native_method("inject", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            let initial_operand: RValue | null = null;
            let symbol: RValue | null = null;
            let proc: Proc | null = null;

            if (block) {
                proc = block.get_data<Proc>();

                if (args.length > 0) {
                    initial_operand = args[0];
                }
            } else {
                if (args.length === 1) {
                    symbol = args[0]
                } else if (args.length > 1) {
                    initial_operand = args[0];
                    symbol = args[1];
                } else {
                    return Qnil;
                }
            }

            let memo: RValue | null = initial_operand;

            Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                if (memo) {
                    if (proc) {
                        memo = proc.call(ExecutionContext.current, [memo, args[0]]);
                    } else {
                        memo = Object.send(memo, symbol!.get_data<string>(), [args[0]]);
                    }
                } else {
                    memo = args[0];
                }

                return Qnil;
            }));

            return memo || Qnil;
        });

        // Uses a so-called "Schwartzian transform" that pre-computes the sort key for each item.
        // https://en.wikipedia.org/wiki/Schwartzian_transform
        mod.define_native_method("sort_by", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            if (block) {
                const proc = block.get_data<Proc>();
                const tuples: RValue[][] = [];

                try {
                    Object.send(self, "each", [], undefined, Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                        const sort_key = proc.call(ExecutionContext.current, [args[0]]);
                        tuples.push([sort_key, args[0] || Qnil]);
                        return Qnil;
                    }));
                } catch (e) {
                    if (e instanceof BreakError) {
                        return e.value;
                    }

                    throw e;
                }

                tuples.sort((x_tuple: RValue[], y_tuple: RValue[]): number => {
                    return spaceship_compare(x_tuple[0], y_tuple[0]);
                });

                return Array.new(tuples.map((tuple: RValue[]) => tuple[1]));
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });
    });
};
