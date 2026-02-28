import { CallDataFlag, MethodCallData } from "../call_data";
import { BreakError, ExecutionContext } from "../execution_context";
import { Class, Module, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { hash_combine } from "../util/hash_utils";
import { Integer } from "./integer";
import { Object } from "./object";
import { RubyString } from "../runtime/string";
import { Range } from "./range";
import { Hash } from "./hash";
import { ArgumentError, IndexError, NameError, TypeError } from "../errors";
import { Proc } from "./proc";
import { Enumerator } from "./enumerator";
import { quick_sort } from "../util/array_utils";
import { spaceship_compare } from "./comparable";
import { Numeric } from "./numeric";
import { Args } from "./arg-scanner";
import { Kernel } from "./kernel";
import { warn } from "console";

export class RubyArray {
    private static klass_: RValue;

    static subclass_new(klass: RValue, arr?: RValue[]): RValue {
        return new RValue(klass, new RubyArray(arr || []));
    }

    static async new(arr?: RValue[]): Promise<RValue> {
        return this.subclass_new(await this.klass(), arr);
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

        klass.define_native_singleton_method("[]", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await RubyArray.subclass_new(self, args);
        });

        klass.define_native_method("initialize", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            let init_arr: RValue[];

            if (args[0]) {
                if (args[0].klass === await RubyArray.klass()) {
                    init_arr = [...args[0].get_data<RubyArray>().elements];
                } else {
                    await Runtime.assert_type(args[0], await Integer.klass());
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
            const strings: string[] = []

            for (const element of elements) {
                const str = await Object.send(element, "inspect");
                strings.push(str.get_data<string>());
            }

            return await RubyString.new(`[${strings.join(", ")}]`);
        });

        await klass.alias_method("to_s", "inspect");

        klass.define_native_method("each", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                try {
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
                return await Enumerator.for_native_generator(async function* () {
                    for (const element of elements) {
                        yield element;
                    }
                });
            }

            return self;
        });

        klass.define_native_method("group_by", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const result = await Hash.new();
            const result_hash = result.get_data<Hash>();

            if (block) {
                try {
                    for (const element of elements) {
                        const key = await Object.send(block, "call", [element]);

                        if (await result_hash.has(key)) {
                            (await result_hash.get(key)).get_data<RubyArray>().add(element);
                        } else {
                            const arr = await RubyArray.new();
                            arr.get_data<RubyArray>().add(element);
                            await result_hash.set(key, arr);
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
                // calling #group_by without a block functions like #each
                return await Enumerator.for_native_generator(async function* () {
                    for (const element of elements) {
                        yield element;
                    }
                });
            }

            return result;
        });

        klass.define_native_method("reverse_each", async (self: RValue, args?: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (block) {
                try {
                    for (let i = elements.length - 1; i >= 0; i --) {
                        await Object.send(block, "call", [elements[i]]);
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
                return await Enumerator.for_native_generator(async function* () {
                    for (let i = elements.length - 1; i >= 0; i --) {
                        yield elements[i];
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

        await klass.alias_method("find_all", "select");

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

        klass.define_native_method("delete_if", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const result: RValue[] = [];

            if (block) {
                try {
                    for (let i = 0; i < elements.length; i ++) {
                        if (!(await Object.send(block, "call", [elements[i]])).is_truthy()) {
                            result.push(elements[i]);
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
                // @TODO: return an Enumerator
            }

            elements.splice(0);
            elements.push(...result);

            return self;
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
                const proc = block.get_data<Proc>();

                for (const element of elements) {
                    if (!(await proc.call(ExecutionContext.current, [element])).is_truthy()) {
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

        klass.define_native_method("none?", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;

            if (args.length > 0) {
                for (const element of elements) {
                    if ((await Object.send(element, "===", [args[0]])).is_truthy()) {
                        return Qfalse;
                    }
                }
            } else if (block) {
                const proc = block.get_data<Proc>();

                for (const element of elements) {
                    if ((await proc.call(ExecutionContext.current, [element])).is_truthy()) {
                        return Qfalse;
                    }
                }
            } else {
                for (const element of elements) {
                    if (element.is_truthy()) {
                        return Qfalse;
                    }
                }
            }

            return Qtrue;
        });

        klass.define_native_method("delete", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [obj] = await Args.scan("1", args);
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

        klass.define_native_method("delete_at", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [index_arg] = await Args.scan("1", args);

            await Runtime.assert_type(index_arg, await Integer.klass());
            let index = index_arg.get_data<number>();

            // wraparound
            if (index < 0) {
                index = elements.length + index;
            }

            if (index < 0 || index >= elements.length) {
                return Qnil;
            }

            const deleted_element = elements[index];
            elements.splice(index, 1);

            return deleted_element;
        });

        klass.define_native_method("[]", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [arg1, arg2] = await Args.scan("11", args);

            if (await Kernel.is_a(arg1, (await Object.find_constant("Range"))!)) {
                const range = arg1.get_data<Range>();

                await Runtime.assert_type(range.begin, await Integer.klass());
                await Runtime.assert_type(range.end, await Integer.klass());

                let start_pos = range.begin.get_data<number>();

                // wraparound
                if (start_pos < 0) {
                    start_pos = elements.length + start_pos;
                }

                let end_pos = range.end.get_data<number>();

                // wraparound
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
                let index = Math.floor(arg1.get_data<number>());

                if (arg2) {
                    await Runtime.assert_type(arg2, await Integer.klass());
                    const length = arg2.get_data<number>();

                    // wraparound
                    if (index < 0) {
                        index = elements.length + index;
                    }

                    return RubyArray.new(elements.slice(index, index + length));
                } else {
                    // wraparound
                    if (index < 0) {
                        index = elements.length + index;
                    }

                    if (index < 0 || index >= elements.length) {
                        return Qnil;
                    }

                    return elements[index];
                }
            }
        });

        klass.define_native_method("[]=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [index_rval, length_or_new_value_rval, new_value_rval] = await Args.scan("12", args);
            await Runtime.assert_type(index_rval, await Integer.klass());
            const index = index_rval.get_data<number>();
            let length: number, new_value: RValue;

            if (length_or_new_value_rval && new_value_rval) {
                new_value = new_value_rval;
                await Runtime.assert_type(length_or_new_value_rval, await Integer.klass());
                length = length_or_new_value_rval.get_data<number>();
            } else {
                new_value = length_or_new_value_rval!;
                length = 1;
            }

            if (index >= elements.length) {
                for (let i = elements.length; i < index; i ++) {
                    elements.push(Qnil);
                }
            }

            // When length > 1, we're replacing a range, so we splice in the array elements.
            // When length == 1, we're setting a single element, so we insert the array as-is.
            if (length > 1 && await Kernel.is_a(new_value, await RubyArray.klass())) {
                elements.splice(index, length, ...new_value.get_data<RubyArray>().elements);
            } else {
                elements.splice(index, length, new_value);
            }

            return new_value;
        });

        klass.define_native_method("fetch", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [index_rval, default_rval] = await Args.scan("11", args);
            await Runtime.assert_type(index_rval, await Integer.klass());
            const index = Math.floor(index_rval.get_data<number>());

            // wraparound for negative indices
            const actual_index = index < 0 ? elements.length + index : index;

            if (actual_index >= 0 && actual_index < elements.length) {
                return elements[actual_index];
            }

            if (block) {
                return await block.get_data<Proc>().call(ExecutionContext.current, [index_rval]);
            } else if (default_rval) {
                return default_rval;
            } else {
                throw new IndexError(`index ${index} outside of array bounds: ${-elements.length}...${elements.length}`);
            }
        });

        const stringify_and_flatten = async (elements: RValue[]): Promise<string[]> => {
            const result = [];

            for (const element of elements) {
                if (element.klass === await RubyString.klass()) {
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
                await Runtime.assert_type(separator, await RubyString.klass());
                separator_str = separator.get_data<string>();
            } else {
                separator_str = "";
            }

            const result = (await stringify_and_flatten(self.get_data<RubyArray>().elements)).join(separator_str);
            return RubyString.new(result);
        });

        klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [target_rval] = await Args.scan("1", args);

            for (const elem of self.get_data<RubyArray>().elements) {
                if ((await Object.send(elem, "==", [target_rval])).is_truthy()) {
                    return Qtrue;
                }
            }

            return Qfalse;
        });

        klass.define_native_method("pop", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [count_rval] = await Args.scan("01", args);

            if (count_rval) {
                await Runtime.assert_type(count_rval, await Integer.klass());
                const count = count_rval.get_data<number>();
                let start = elements.length - count;
                if (start < 0) start = 0;
                return await RubyArray.new(elements.splice(start, count));
            } else {
                return elements.pop() || Qnil;
            }
        });

        klass.define_native_method("shift", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [count_rval] = await Args.scan("01", args);

            if (count_rval) {
                await Runtime.assert_type(count_rval, await Integer.klass());
                const count = count_rval.get_data<number>();
                return await RubyArray.new(elements.splice(0, count));
            } else {
                return elements.shift() || Qnil;
            }
        });

        klass.define_native_method("unshift", async (self: RValue, args: RValue[], _kwargs?: Hash, _block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [new_elements] = await Args.scan("*", args);
            elements.unshift(...new_elements);
            return self;
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);
            await Runtime.assert_type(other_rval, await RubyArray.klass());
            return await RubyArray.new(self.get_data<RubyArray>().elements.concat(other_rval.get_data<RubyArray>().elements));
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [ary_arg] = await Args.scan("1", args);
            const elements = self.get_data<RubyArray>().elements;
            const ary = await Runtime.coerce_to_array(ary_arg);
            const to_remove = ary.get_data<RubyArray>().elements;
            const to_remove_set = new Hash();
            const result = [];

            for (const element of to_remove) {
                await to_remove_set.set(element, Qtrue);
            }

            for (const element of elements) {
                if (!(await to_remove_set.has(element))) {
                    result.push(element);
                }
            }

            return await RubyArray.new(result);
        });

        klass.define_native_method("|", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [ary_arg] = await Args.scan("1", args);
            const elements = self.get_data<RubyArray>().elements;
            const ary = await Runtime.coerce_to_array(ary_arg);
            const other_elements = ary.get_data<RubyArray>().elements;
            const seen = new Hash();
            const result = [];

            // add all unique elements from self
            for (const element of elements) {
                if (!(await seen.has(element))) {
                    await seen.set(element, Qtrue);
                    result.push(element);
                }
            }

            // add all unique elements from other that haven't already been "seen"
            for (const element of other_elements) {
                if (!(await seen.has(element))) {
                    await seen.set(element, Qtrue);
                    result.push(element);
                }
            }

            return await RubyArray.new(result);
        });

        klass.define_native_method("&", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [ary_arg] = await Args.scan("1", args);
            const elements = self.get_data<RubyArray>().elements;
            const ary = await Runtime.coerce_to_array(ary_arg);
            const other_elements = ary.get_data<RubyArray>().elements;
            const other_seen = new Hash();
            const seen = new Hash();
            const result = [];

            for (const element of other_elements) {
                await other_seen.set(element, Qtrue);
            }

            for (const element of elements) {
                if (await other_seen.has(element) && !await seen.has(element)) {
                    result.push(element);
                    await seen.set(element, Qtrue);
                }
            }

            return await RubyArray.new(result);
        });

        klass.define_native_method("<<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [element_rval] = await Args.scan("1", args);
            self.get_data<RubyArray>().elements.push(element_rval);
            return self;
        });

        klass.define_native_method("push", (self: RValue, args: RValue[], _kwargs?: Hash, _block?: RValue, call_data?: MethodCallData): RValue => {
            const elements = self.get_data<RubyArray>().elements;
            elements.push(...args);
            return self;
        });

        klass.define_native_method("size", async (self: RValue): Promise<RValue> => {
            return await Integer.get(self.get_data<RubyArray>().elements.length);
        });

        await klass.alias_method("length", "size");

        klass.define_native_method("first", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [count_rval] = await Args.scan("01", args);

            if (count_rval) {
                await Runtime.assert_type(count_rval, await Integer.klass());
                const count = args[0].get_data<number>();
                return await RubyArray.new(elements.slice(0, count));
            } else {
                return elements[0] || Qnil;
            }
        });

        klass.define_native_method("last", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [count_rval] = await Args.scan("01", args);

            if (count_rval) {
                await Runtime.assert_type(count_rval, await Integer.klass());
                const count = count_rval.get_data<number>();
                let start = elements.length - count;
                if (start < 0) start = 0;
                return await RubyArray.new(elements.slice(start, start + count));
            } else {
                return elements[elements.length - 1] || Qnil;
            }
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return await RubyArray.new([...self.get_data<RubyArray>().elements]);
        });

        klass.define_native_method("concat", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const ruby_array_class = await RubyArray.klass();

            for (const arg of args) {
                await Runtime.assert_type(arg, ruby_array_class);
            }

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

        klass.define_native_method("compact!", (self: RValue): RValue => {
            const elements = self.get_data<RubyArray>().elements;
            const result: RValue[] = [];
            let modified = false;

            for (const element of elements) {
                if (element === Qnil) {
                    modified = true;
                } else {
                    result.push(element);
                }
            }

            elements.splice(0);
            elements.push(...result);

            if (modified) {
                return self;
            } else {
                return Qnil;
            }
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return await RubyArray.new([...self.get_data<RubyArray>().elements]);
        });

        klass.define_native_method("replace", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);
            await Runtime.assert_type(other_rval, await RubyArray.klass());
            self.get_data<RubyArray>().elements = [...other_rval.get_data<RubyArray>().elements];
            return self;
        });

        await klass.alias_method("initialize_copy", "replace");

        klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            let hash = elements.length;

            for (const element of elements) {
                const elem_hash = await Object.send(element, "hash");
                await Runtime.assert_type(elem_hash, await Integer.klass());
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

        klass.define_native_method("to_ary", (self: RValue): RValue => {
            return self;
        });

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

        const flatten = async (elements: RValue[], max_depth: number): Promise<[RValue[], boolean]> => {
            return await flatten_helper(elements, max_depth, 0);
        }

        const flatten_helper = async (elements: RValue[], max_depth: number, depth: number): Promise<[RValue[], boolean]> => {
            const result = [];
            const is_a_args = [await RubyArray.klass()];
            let modified = false;

            for (const element of elements) {
                const is_arr = await Object.send(element, "is_a?", is_a_args);

                if (is_arr.is_truthy() && (max_depth < 0 || depth < max_depth)) {
                    const [child_elements, child_modified] = await flatten_helper(
                        element.get_data<RubyArray>().elements, max_depth, depth + 1
                    );

                    result.push(...child_elements);
                    modified ||= child_modified;
                } else {
                    result.push(element);
                }
            }

            return [result, modified];
        }

        klass.define_native_method("flatten", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [max_depth_rval] = await Args.scan("01", args);
            let max_depth = -1;

            if (max_depth_rval) {
                await Runtime.assert_type(max_depth_rval, await Integer.klass());
                max_depth = max_depth_rval.get_data<number>();
            }

            const [flattened, _] = await flatten(self.get_data<RubyArray>().elements, max_depth);
            return await RubyArray.new(flattened);
        });

        klass.define_native_method("flatten!", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [max_depth_rval] = await Args.scan("01", args);
            let max_depth = -1;

            if (max_depth_rval) {
                await Runtime.assert_type(max_depth_rval, await Integer.klass());
                max_depth = args[0].get_data<number>();
            }

            const [flattened, modified] = await flatten(self.get_data<RubyArray>().elements, max_depth);

            self.get_data<RubyArray>().elements = flattened;

            if (modified) {
                return self;
            }

            return Qnil;
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
            const [other_array_rval] = await Args.scan("1", args);

            if (!(await Object.respond_to(other_array_rval, "size"))) {
                return Qfalse;
            }

            const other_array_size = await Object.send(other_array_rval, "size");

            if (other_array_size.klass !== await Integer.klass()) {
                return Qfalse;
            }

            if (array.length !== other_array_size.get_data<number>()) {
                return Qfalse;
            }

            for (let i = 0; i < array.length; i ++) {
                const obj = array[i];
                const other_obj = await Object.send(other_array_rval, "[]", [await Integer.get(i)]);

                if (!(await Object.send(obj, "==", [other_obj])).is_truthy()) {
                    return Qfalse;
                }
            }

            return Qtrue;
        });

        klass.define_native_method("<=>", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const other = args[0];

            if (!(await Object.send(other, "is_a?", [await RubyArray.klass()])).is_truthy()) {
                return Qnil;
            }

            const self_elements = self.get_data<RubyArray>().elements;
            const other_elements = other.get_data<RubyArray>().elements;

            const min_length = Math.min(self_elements.length, other_elements.length);

            for (let i = 0; i < min_length; i++) {
                const cmp = await Object.send(self_elements[i], "<=>", [other_elements[i]]);

                if (cmp === Qnil) {
                    return Qnil;
                }

                const cmp_value = cmp.get_data<number>();

                // return first non-equal result
                if (cmp_value !== 0) {
                    return cmp;
                }
            }

            // all elements are equal, compare lengths
            if (self_elements.length < other_elements.length) {
                return await Integer.get(-1);
            } else if (self_elements.length > other_elements.length) {
                return await Integer.get(1);
            } else {
                return await Integer.get(0);
            }
        });

        const sort = async (elements: RValue[], block?: Proc) => {
            let compare_fn = spaceship_compare;

            if (block) {
                compare_fn = async (x: RValue, y: RValue): Promise<number> => {
                    const result = await block.call(ExecutionContext.current, [x, y]);

                    if ((await Object.send(result, "is_a?", [await Numeric.klass()])).is_truthy()) {
                        return result.get_data<number>();
                    } else {
                        const x_class_name = x.klass.get_data<Module>().name;
                        const y_class_name = y.klass.get_data<Module>().name;
                        throw new ArgumentError(`comparison of ${x_class_name} with ${y_class_name} failed`);
                    }
                };
            }

            await quick_sort(elements, compare_fn);
        }

        klass.define_native_method("sort", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = [...self.get_data<RubyArray>().elements];
            await sort(elements, block?.get_data<Proc>());
            return await RubyArray.new(elements);
        });

        klass.define_native_method("sort!", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            await sort(self.get_data<RubyArray>().elements, block?.get_data<Proc>());
            return self;
        });

        klass.define_native_method("uniq", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const seen = new Hash();
            const result: RValue[] = [];

            for (let i = 0; i < elements.length; i ++) {
                if (block) {
                    try {
                        const elem = await Object.send(block, "call", [elements[i]]);

                        if (!(await seen.has(elem))) {
                            result.push(elem);
                            await seen.set(elem, Qtrue);
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
                    if (!(await seen.has(elements[i]))) {
                        result.push(elements[i]);
                        await seen.set(elements[i], Qtrue);
                    }
                }
            }

            return await RubyArray.new(result);
        });

        klass.define_native_method("count", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const elements = self.get_data<RubyArray>().elements;
            const [target_arg] = await Args.scan("01", args);

            if (!target_arg && !block) {
                return await Integer.get(elements.length);
            }

            if (target_arg && block) {
                warn("warning: given block not used");
            }

            let count = 0;

            if (target_arg) {
                const target_arg_arr = [target_arg];

                for (const element of elements) {
                    if ((await Object.send(element, "==", target_arg_arr)).is_truthy()) {
                        count ++;
                    }
                }
            } else {
                const proc = block!.get_data<Proc>();

                for (const element of elements) {
                    const result = await proc.call(ExecutionContext.current, [element]);

                    if (result.is_truthy()) {
                        count ++;
                    }
                }
            }

            return await Integer.get(count);
        });

        const product_helper = async (arrays: RValue[][], index: number, accum: RValue[], callback: (result: RValue[]) => Promise<void>) => {
            for (const element of arrays[index]) {
                const new_arr = [...accum, element];

                if (index === arrays.length - 1) {
                    await callback(new_arr);
                } else {
                    await product_helper(arrays, index + 1, new_arr, callback);
                }
            }
        }

        klass.define_native_method("product", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const other_arrays: RValue[][] = [self.get_data<RubyArray>().elements];

            for (const arg of args) {
                const array_rval = await Runtime.coerce_to_array(arg);
                other_arrays.push(array_rval.get_data<RubyArray>().elements);
            }

            if (block) {
                const proc = block.get_data<Proc>();
                const ec = ExecutionContext.current;

                await product_helper(other_arrays, 0, [], async (result: RValue[]) => {
                    await proc.call(ec, [await RubyArray.new(result)]);
                });

                return self;
            } else {
                const all_results: RValue[] = [];

                await product_helper(other_arrays, 0, [], async (result: RValue[]) => {
                    all_results.push(await RubyArray.new(result));
                });

                return await RubyArray.new(all_results);
            }
        });

        klass.define_native_method("min", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const [count_rval] = await Args.scan("01", args);
            const elements = self.get_data<RubyArray>().elements;
            const sorted = [...elements];

            if (block) {
                const proc = block.get_data<Proc>();

                await quick_sort(sorted, async (a: RValue, b: RValue) => {
                    const cmp_result = await proc.call(ExecutionContext.current, [a, b]);
                    const result_is_int = await Object.send(cmp_result, "is_a?", [await Integer.klass()]);

                    if (!result_is_int.is_truthy()) {
                        throw new ArgumentError(`comparision of ${cmp_result.klass.get_data<Class>().name} with 0 failed`);
                    }

                    return cmp_result.get_data<number>();
                });
            } else {
                await quick_sort(sorted);
            }

            if (count_rval) {
                await Runtime.assert_type(count_rval, await Numeric.klass());
                const count = count_rval.get_data<number>();

                if (count < 0) {
                    throw new ArgumentError(`negative size (${count})`);
                }

                return await RubyArray.new(sorted.slice(0, count));
            } else {
                return sorted[0] || Qnil;
            }
        });

        klass.define_native_method("*", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [separator_or_n] = await Args.scan("1", args);
            await Runtime.assert_type(separator_or_n, await Integer.klass(), await RubyString.klass());

            if (await Kernel.is_a(separator_or_n, await Integer.klass())) {
                const n = separator_or_n.get_data<number>();

                if (n < 0) {
                    throw new ArgumentError("negative argument");
                }

                const elements = self.get_data<RubyArray>().elements;
                const result: RValue[] = [];

                for (let i = 0; i < n; i ++) {
                    result.push(...elements);
                }

                return RubyArray.new(result);
            } else {
                return Object.send(self, "join", args);
            }
        });
    });

    inited = true;
};
