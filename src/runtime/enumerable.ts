import { BreakError, ExecutionContext } from "../execution_context";
import { Module, Qnil, RValue, Runtime, Qfalse, Qtrue } from "../runtime"
import { Integer } from "./integer";
import { Object } from "./object";
import { Proc } from "./proc";
import { RubyArray } from "../runtime/array";
import { ArgumentError, NameError } from "../errors";
import { Lazy } from "./enumerator";
import { Hash } from "./hash";
import { schwartzian_quick_sort } from "../util/array_utils";

export class Enumerable {
    private static module_: RValue;

    static async module(): Promise<RValue> {
        if (!this.module_) {
            const klass = await Object.find_constant("Enumerable");

            if (klass) {
                this.module_ = klass;
            } else {
                throw new NameError("missing constant Enumerable");
            }
        }

        return this.module_;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    const mod_rval = Runtime.define_module("Enumerable");
    const mod = mod_rval.get_data<Module>();

    mod.define_native_method("map", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            try {
                const results: RValue[] = [];
                const proc = block.get_data<Proc>();

                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
                    results.push(await proc.call(ExecutionContext.current, args, kwargs));
                    return Qnil;
                }));

                return await RubyArray.new(results);
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                } else {
                    throw e;
                }
            }
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });

    await mod.alias_method("collect", "map");

    mod.define_native_method("find", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            try {
                const proc = block.get_data<Proc>();

                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                    if ((await proc.call(ExecutionContext.current, args)).is_truthy()) {
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

    mod.define_native_method("any?", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        let found = false;

        try {
            const proc = block ? block.get_data<Proc>() : null;

            await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                const item = proc ? await proc.call(ExecutionContext.current, args) : args[0];

                if (!item.is_truthy) debugger;

                if (item.is_truthy()) {
                    found = true;
                    throw "any?";
                }

                return Qnil;
            }));
        } catch (e) {
            if (e !== "any?") {
                throw e;
            }
        }

        return found ? Qtrue : Qfalse;
    });

    mod.define_native_method("partition", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block.get_data<Proc>();
            const truthy_array: RValue[] = [];
            const falsey_array: RValue[] = [];

            await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                const key = await proc.call(ExecutionContext.current, args);

                if (key.is_truthy()) {
                    truthy_array.push(args[0]);
                } else {
                    falsey_array.push(args[0]);
                }

                return Qnil;
            }));

            return await RubyArray.new([await RubyArray.new(truthy_array), await RubyArray.new(falsey_array)]);
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });

    mod.define_native_method("inject", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
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

        await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
            if (memo) {
                if (proc) {
                    memo = await proc.call(ExecutionContext.current, [memo, args[0]]);
                } else {
                    memo = await Object.send(memo, symbol!.get_data<string>(), [args[0]]);
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
    mod.define_native_method("sort_by", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block.get_data<Proc>();
            const tuples: [RValue, RValue][] = [];

            try {
                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                    const sort_key = await proc.call(ExecutionContext.current, [args[0]]);
                    tuples.push([sort_key, args[0] || Qnil]);
                    return Qnil;
                }));
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            await schwartzian_quick_sort(tuples);

            return await RubyArray.new(tuples.map((tuple: RValue[]) => tuple[1]));
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });

    mod.define_native_method("each_with_index", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block.get_data<Proc>();
            let index = 0;

            try {
                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                    await proc.call(ExecutionContext.current, [...args, await Integer.get(index)]);
                    index ++;
                    return Qnil;
                }));
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            return self;
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });

    mod.define_native_method("each_with_object", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block.get_data<Proc>();
            const object = args[0];

            try {
                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, block_args: RValue[]): Promise<RValue> => {
                    await proc.call(ExecutionContext.current, [block_args[0], object]);
                    return Qnil;
                }));
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            return object;
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });

    mod.define_native_method("first", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const found: RValue[] = [];
        let count: number;

        if (args.length > 0) {
            count = args[0].get_data<number>();

            if (count < 0) {
                throw new ArgumentError("attempt to take negative size");
            }
        } else {
            count = 1;
        }

        if (count === 0) {
            return await RubyArray.new([]);
        }

        try {
            await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, (_self: RValue, args: RValue[]): RValue => {
                found.push(args[0]);

                if (found.length === count) {
                    throw new BreakError(Qnil);
                }

                return Qnil;
            }));
        } catch (e) {
            if (!(e instanceof BreakError)) {
                throw e;
            }
        }

        // Only return an array if a length argument was provided.
        // If no length argument, return the first item not wrapped in an array.
        if (args.length > 0) {
            return RubyArray.new(found);
        } else {
            return found[0];
        }
    });

    mod.define_native_method("lazy", async (self: RValue): Promise<RValue> => {
        return await Lazy.new(self);
    });

    mod.define_native_method("find_index", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        let index = 0;

        if (block) {
            const proc = block.get_data<Proc>();

            try {
                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, each_args: RValue[]): Promise<RValue> => {
                    if ((await proc.call(ExecutionContext.current, each_args)).is_truthy()) {
                        throw new BreakError(await Integer.get(index));
                    }

                    index ++;
                    return Qnil;
                }));

                // no match found
                return Qnil;
            } catch (e) {
                if (e instanceof BreakError) {
                    // match found, return index
                    return e.value;
                } else {
                    // an error occurred
                    throw e;
                }
            }
        } else if (args.length > 0) {
            const target = args[0];

            try {
                await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, each_args: RValue[]): Promise<RValue> => {
                    if ((await Object.send(each_args[0], "==", [target])).is_truthy()) {
                        throw new BreakError(await Integer.get(index));
                    }

                    index++;
                    return Qnil;
                }));

                // no match found
                return Qnil;
            } catch (e) {
                if (e instanceof BreakError) {
                    // match found, return index
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

    await mod.alias_method("index", "find_index");

    mod.define_native_method("to_a", async (self: RValue): Promise<RValue> => {
        const results: RValue[] = [];

        try {
            await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                results.push(args[0]);
                return Qnil;
            }));
        } catch (e) {
            if (e instanceof BreakError) {
                return e.value;
            } else {
                throw e;
            }
        }

        return await RubyArray.new(results);
    });

    await mod.alias_method("entries", "to_a");

    inited = true;
};
