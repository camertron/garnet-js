import { CallDataFlag, MethodCallData } from "../call_data";
import { BreakError, ExecutionContext } from "../execution_context";
import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { hash_combine } from "../util/hash_utils";
import { Integer } from "./integer";
import { Object } from "./object";
import { String } from "../runtime/string";
import { Range } from "./range";
import { Hash } from "./hash";
import { ArgumentError, NameError, TypeError } from "../errors";
import { Proc } from "./proc";
import { Enumerator } from "./enumerator";

export class RubyArray {
    private static klass_: RValue;

    static async new(arr?: RValue[]): Promise<RValue> {
        return new RValue(await this.klass(), new RubyArray(arr || []));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("Array");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant Array");
            }
        }

        return this.klass_;
    }

    public elements: RValue[];

    constructor(elements: RValue[]) {
        this.elements = elements;
    }

    add(element: RValue) {
        this.elements.push(element);
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Array", ObjectClass, async (klass: Class) => {
        klass.include((await Object.find_constant("Enumerable"))!);

        klass.define_native_singleton_method("[]", async (_self: RValue, args: RValue[]): Promise<RValue> => {
            return await RubyArray.new(args);
        });

        klass.define_native_method("initialize", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            let init_arr: RValue[];

            if (args[0]) {
                if (args[0].klass === await RubyArray.klass()) {
                    init_arr = [...args[0].get_data<RubyArray>().elements];
                } else {
                    Runtime.assert_type(args[0], await Integer.klass());
                    const size = args[0].get_data<number>();

                    // block supercedes default value
                    if (block) {
                        const proc = block.get_data<Proc>();
                        init_arr = [];

                        try {
                            for (let i = 0; i < size; i ++) {
                                const val = await proc.call(ExecutionContext.current, [await Integer.get(i)]);
                                init_arr.push(val);
                            }
                        } catch (e) {
                            if (e instanceof BreakError) {
                                return e.value;
                            }

                            throw e;
                        }
                    } else {
                        const default_value = args.length > 1 ? args[1] : Qnil;
                        init_arr = Array(size).fill(default_value);
                    }
                }
            } else {
                init_arr = [];
            }

            self.data = new RubyArray(init_arr);
            return Qnil;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            const strings = await Promise.all(
                elements.map(async (element: RValue): Promise<string> => {
                    return (await Object.send(element, "inspect")).get_data<string>();
                })
            );

            return await String.new(`[${strings.join(", ")}]`);
        });

        await klass.alias_method("to_s", "inspect");

        klass.define_native_method("each", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (block) {
                try {
                    const elements = self.get_data<RubyArray>().elements;

                    for (const element of elements) {
                        await Object.send(block, "call", [element]);
                    }
                } catch (e) {
                    if (e instanceof BreakError) {
                        // return break value
                        return e.value;
                    } else {
                        // an error occurred
                        throw e;
                    }
                }
            } else {
                const elements = self.get_data<RubyArray>().elements;

                return await Enumerator.for_native_generator(async function* () {
                    for (const element of elements) {
                        yield element;
                    }
                });
            }

            return self;
        });

        klass.define_native_method("select", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                try {
                    const results: RValue[] = [];

                    for (const element of elements) {
                        if ((await Object.send(block, "call", [element])).is_truthy()) {
                            results.push(element);
                        }
                    };

                    return RubyArray.new(results);
                } catch (e) {
                    if (e instanceof BreakError) {
                        // select returns nil if a break occurs in the block
                        return Qnil;
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

        klass.define_native_method("reject", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                try {
                    const results: RValue[] = [];

                    for (const element of elements) {
                        if (!(await Object.send(block, "call", [element])).is_truthy()) {
                            results.push(element);
                        }
                    };

                    return RubyArray.new(results);
                } catch (e) {
                    if (e instanceof BreakError) {
                        // reject returns nil if a break occurs in the block
                        return Qnil;
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

        klass.define_native_method("index", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                try {
                    for (let i = 0; i < elements.length; i ++) {
                        if ((await Object.send(block, "call", [elements[i]])).is_truthy()) {
                            return Integer.get(i);
                        }
                    }
                } catch (e) {
                    if (e instanceof BreakError) {
                        // return break value
                        return e.value;
                    } else {
                        // an error occurred
                        throw e;
                    }
                }
            } else {
                if (args.length > 0) {
                    for (let i = 0; i < elements.length; i ++) {
                        if ((await Object.send(args[0], "==", [elements[i]])).is_truthy()) {
                            return Integer.get(i);
                        }
                    }
                } else {
                    // @TODO: return an Enumerator
                }
            }

            return Qnil;
        });

        klass.define_native_method("map!", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (block) {
                try {
                    const results: RValue[] = [];
                    const proc = block.get_data<Proc>();

                    await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
                        results.push(await proc.call(ExecutionContext.current, args, kwargs));
                        return Qnil;
                    }));

                    self.get_data<RubyArray>().elements = results;
                    return self;
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

        klass.define_native_method("all?", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (args.length > 0) {
                for (const element of elements) {
                    if (!(await Object.send(element, "===", [args[0]])).is_truthy()) {
                        return Qfalse;
                    }
                }
            } else if (block) {
                for (const element of elements) {
                    if (!(await Object.send(block, "call", [element])).is_truthy()) {
                        return Qfalse;
                    }
                }
            } else {
                for (const element of elements) {
                    if (!element.is_truthy()) {
                        return Qfalse;
                    }
                }
            }

            return Qtrue;
        });

        klass.define_native_method("delete", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const obj = args[0];
            let found_index: number | null = null;

            for (let i = 0; i < elements.length; i ++) {
                if ((await Object.send(obj, "==", [elements[i]])).is_truthy()) {
                    found_index = i;
                    break;
                }
            }

            if (found_index != null) {
                const found_element = elements[found_index];
                elements.splice(found_index, 1);
                return found_element;
            }

            if (block) {
                return await block.get_data<Proc>().call(ExecutionContext.current, [obj]);
            }

            return Qnil;
        });

        klass.define_native_method("[]", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (args[0].klass == (await Object.find_constant("Range"))!) {
                const range = args[0].get_data<Range>();

                Runtime.assert_type(range.begin, await Integer.klass());
                Runtime.assert_type(range.end, await Integer.klass());

                let start_pos = range.begin.get_data<number>();

                if (start_pos < 0) {
                    start_pos = elements.length + start_pos;
                }

                let end_pos = range.end.get_data<number>();

                if (end_pos < 0) {
                    end_pos = elements.length + end_pos;
                }

                if (start_pos > end_pos) {
                    return RubyArray.new([]);
                }

                if (range.exclude_end) {
                    return RubyArray.new(elements.slice(start_pos, end_pos));
                } else {
                    return RubyArray.new(elements.slice(start_pos, end_pos + 1));
                }
            } else {
                // floor here because you can pass a float to Array#[]
                const index = Math.floor(args[0].get_data<number>());

                if (args.length > 1) {
                    Runtime.assert_type(args[1], await Integer.klass());
                    const length = args[1].get_data<number>();
                    return RubyArray.new(elements.slice(index, index + length));
                } else {
                    return elements[index] || Qnil;
                }
            }
        });

        // @TODO: fill array with Qnils
        klass.define_native_method("[]=", (self: RValue, args: RValue[]): RValue => {
            const elements = self.get_data<RubyArray>().elements;
            const index = args[0].get_data<number>();
            const new_value = args[1];

            elements[index] = new_value;
            return new_value;
        });

        const stringify_and_flatten = async (elements: RValue[]): Promise<string[]> => {
            const result = [];

            for (const element of elements) {
                if (element.klass === await String.klass()) {
                    result.push(element.get_data<string>());
                } else if (element.klass === await RubyArray.klass()) {
                    result.push(...await stringify_and_flatten(element.get_data<RubyArray>().elements));
                } else {
                    result.push((await Object.send(element, "to_s")).get_data<string>());
                }
            }

            return result;
        }

        klass.define_native_method("join", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const separator = args[0] || ExecutionContext.current.globals["$,"] || Qnil;
            let separator_str;

            if (separator.is_truthy()) {
                Runtime.assert_type(separator, await String.klass());
                separator_str = separator.get_data<string>();
            } else {
                separator_str = "";
            }

            const result = (await stringify_and_flatten(self.get_data<RubyArray>().elements)).join(separator_str);
            return String.new(result);
        });

        klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            for (const elem of self.get_data<RubyArray>().elements) {
                if ((await Object.send(elem, "==", args)).is_truthy()) {
                    return Qtrue;
                }
            }

            return Qfalse;
        });

        klass.define_native_method("pop", (self: RValue, args: RValue[]): RValue => {
            return self.get_data<RubyArray>().elements.pop() || Qnil;
        });

        klass.define_native_method("shift", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let count = 1;

            if (args.length > 0) {
                Runtime.assert_type(args[0], await Integer.klass());
                count = args[0].get_data<number>();
            }

            const elements = self.get_data<RubyArray>().elements;

            // a count of 0 should return an empty array
            if (count === 1) {
                return elements.shift() || Qnil;
            } else {
                return await RubyArray.new(elements.splice(0, count));
            }
        });

        klass.define_native_method("unshift", async (self: RValue, args: RValue[], _kwargs?: Hash, _block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
                for (const arg of args) {
                    if (arg.klass === await RubyArray.klass()) {
                        elements.unshift(...arg.get_data<RubyArray>().elements);
                    } else {
                        elements.unshift(arg);
                    }
                }
            } else {
                elements.unshift(...args);
            }

            return self;
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await RubyArray.klass());
            return await RubyArray.new(self.get_data<RubyArray>().elements.concat(args[0].get_data<RubyArray>().elements));
        });

        klass.define_native_method("<<", (self: RValue, args: RValue[]): RValue => {
            self.get_data<RubyArray>().elements.push(args[0]);
            return self;
        });

        klass.define_native_method("push", (self: RValue, args: RValue[], _kwargs?: Hash, _block?: RValue, call_data?: MethodCallData): RValue => {
            const elements = self.get_data<RubyArray>().elements;

            // this is wrong but I don't know how to fix it, since I need to know which args are splatted
            // but that info is not available right now. We'll need to capture more info in CallData.
            if (call_data && call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
                for (const arg of args) {
                    elements.push(...arg.get_data<RubyArray>().elements);
                }
            } else {
                elements.push(...args);
            }

            return self;
        });

        klass.define_native_method("size", async (self: RValue): Promise<RValue> => {
            return await Integer.get(self.get_data<RubyArray>().elements.length);
        });

        await klass.alias_method("length", "size");

        klass.define_native_method("first", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            let count;

            if (args.length > 0) {
                Runtime.assert_type(args[0], await Integer.klass());
                count = args[0].get_data<number>();
            } else {
                count = 1;
            }

            if (args.length === 0) {
                if (elements.length > 0) {
                    return elements[0];
                } else {
                    return Qnil;
                }
            } else {
                return await RubyArray.new(elements.slice(0, count));
            }
        });

        klass.define_native_method("last", (self: RValue): RValue => {
            const elements = self.get_data<RubyArray>().elements;

            if (elements.length > 0) {
                return elements[elements.length - 1];
            } else {
                return Qnil;
            }
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return await RubyArray.new([...self.get_data<RubyArray>().elements]);
        });

        klass.define_native_method("concat", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const ruby_array_class = await RubyArray.klass()
            args.forEach((arg) => Runtime.assert_type(arg, ruby_array_class));
            const elements = self.get_data<RubyArray>().elements;
            args.forEach((arg) => elements.push(...arg.get_data<RubyArray>().elements));
            return self;
        });

        klass.define_native_method("empty?", (self: RValue): RValue => {
            return self.get_data<RubyArray>().elements.length === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("clear", (self: RValue): RValue => {
            const elements = self.get_data<RubyArray>().elements;
            elements.splice(0, elements.length);
            return self;
        });

        klass.define_native_method("compact", async (self: RValue): Promise<RValue> => {
            const result: RValue[] = [];

            for (const element of self.get_data<RubyArray>().elements) {
                if (element !== Qnil) {
                    result.push(element);
                }
            }

            return await RubyArray.new(result);
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return await RubyArray.new([...self.get_data<RubyArray>().elements]);
        });

        klass.define_native_method("replace", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await RubyArray.klass());
            const other = args[0];
            self.get_data<RubyArray>().elements = [...other.get_data<RubyArray>().elements];
            return self;
        });

        await klass.alias_method("initialize_copy", "replace");

        klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            let hash = elements.length;

            for (const element of elements) {
                const elem_hash = await Object.send(element, "hash");
                Runtime.assert_type(elem_hash, await Integer.klass());
                hash = hash_combine(hash, elem_hash.get_data<number>());
            }

            return Integer.get(hash);
        });

        const add_tuple_to_hash = async (tuple: RValue, idx: number, hash: Hash) => {
            if (tuple.klass === await RubyArray.klass()) {
                const elements = tuple.get_data<RubyArray>().elements;

                if (elements.length === 2) {
                    await hash.set(elements[0], elements[1]);
                } else {
                    throw new ArgumentError(`wrong array length at ${idx} (expected 2, was ${elements.length})`);
                }
            } else {
                throw new TypeError(`wrong element type ${tuple.klass.get_data<Class>().name} (expected array)`);
            }
        }

        klass.define_native_method("to_h", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = new Hash();
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                const proc = block.get_data<Proc>();
                let idx = 0;

                try {
                    for (idx = 0; idx < elements.length; idx ++) {
                        const tuple = await proc.call(ExecutionContext.current, [elements[idx]]);
                        await add_tuple_to_hash(tuple, idx, hash);
                    }
                } catch (e) {
                    if (e instanceof BreakError) {
                        await add_tuple_to_hash(e.value, idx, hash);
                    } else {
                        throw e;
                    }
                }
            } else {
                for (let idx = 0; idx < elements.length; idx ++) {
                    await add_tuple_to_hash(elements[idx], idx, hash);
                }
            }

            return Hash.from_hash(hash);
        });

        klass.define_native_method("reverse", async (self: RValue): Promise<RValue> => {
            return await RubyArray.new([...self.get_data<RubyArray>().elements].reverse());
        });

        klass.define_native_method("reverse!", (self: RValue): RValue => {
            self.get_data<RubyArray>().elements.reverse();
            return self;
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const array = self.get_data<RubyArray>().elements;
            const other_array = args[0];

            if (!Object.respond_to(other_array, "size")) {
                return Qfalse;
            }

            const other_array_size = await Object.send(other_array, "size");

            if (other_array_size.klass !== await Integer.klass()) {
                return Qfalse;
            }

            if (array.length !== other_array_size.get_data<number>()) {
                return Qfalse;
            }

            for (let i = 0; i < array.length; i ++) {
                const obj = array[i];
                const other_obj = await Object.send(other_array, "[]", [await Integer.get(i)]);

                if (!(await Object.send(obj, "==", [other_obj])).is_truthy()) {
                    return Qfalse;
                }
            }

            return Qtrue;
        });
    });

    inited = true;
};
