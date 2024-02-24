import { CallDataFlag, MethodCallData } from "../call_data";
import { BreakError, ExecutionContext } from "../execution_context";
import { Array as RubyArray, ArrayClass, Class, IntegerClass, Kwargs, Qfalse, Qnil, Qtrue, RValue, Runtime, StringClass } from "../runtime";
import { hash_combine } from "../util/hash_utils";
import { Integer } from "./integer";
import { Object } from "./object";
import { String } from "../runtime/string";
import { Range } from "./range";
import { Hash } from "./hash";
import { ArgumentError, TypeError } from "../errors";
import { Proc } from "./proc";

let inited = false;

export const init = () => {
    if (inited) return;

    const klass = Object.find_constant("Array")!.get_data<Class>();

    klass.include(Object.find_constant("Enumerable")!);

    klass.define_native_method("initialize", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        let init_arr: RValue[];

        if (args[0]) {
            if (args[0].klass === ArrayClass) {
                init_arr = [...args[0].get_data<RubyArray>().elements];
            } else {
                Runtime.assert_type(args[0], IntegerClass);
                const size = args[0].get_data<number>();

                // block supercedes default value
                if (block) {
                    const proc = block.get_data<Proc>();
                    init_arr = [];

                    try {
                        for (let i = 0; i < size; i ++) {
                            const val = proc.call(ExecutionContext.current, [Integer.get(i)]);
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

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        const strings = elements.map( (element: RValue): string => {
            return Object.send(element, "inspect").get_data<string>();
        });

        return String.new(`[${strings.join(", ")}]`);
    });

    klass.define_native_method("each", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue): RValue => {
        if (block) {
            try {
                const elements = self.get_data<RubyArray>().elements;

                for (const element of elements) {
                    Object.send(block, "call", [element]);
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

        return self;
    });

    klass.define_native_method("select", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (block) {
            try {
                const results: RValue[] = [];

                for (const element of elements) {
                    if (Object.send(block, "call", [element]).is_truthy()) {
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

    klass.define_native_method("reject", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (block) {
            try {
                const results: RValue[] = [];

                for (const element of elements) {
                    if (!Object.send(block, "call", [element]).is_truthy()) {
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

    klass.define_native_method("index", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (block) {
            try {
                for (let i = 0; i < elements.length; i ++) {
                    if (Object.send(block, "call", [elements[i]]).is_truthy()) {
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
                    if (Object.send(args[0], "==", [elements[i]]).is_truthy()) {
                        return Integer.get(i);
                    }
                }
            } else {
                // @TODO: return an Enumerator
            }
        }

        return Qnil;
    });

    klass.define_native_method("all?", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (args.length > 0) {
            for (const element of elements) {
                if (!Object.send(element, "===", [args[0]]).is_truthy()) {
                    return Qfalse;
                }
            }
        } else if (block) {
            for (const element of elements) {
                if (!Object.send(block, "call", [element]).is_truthy()) {
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

    klass.define_native_method("delete", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;
        const obj = args[0];
        let found_index: number | null = null;

        for (let i = 0; i < elements.length; i ++) {
            if (Object.send(obj, "==", [elements[i]]).is_truthy()) {
                found_index = i;
                break;
            }
        }

        if (found_index) {
            const found_element = elements[found_index];
            delete elements[found_index];
            return found_element;
        }

        if (block) {
            return block.get_data<Proc>().call(ExecutionContext.current, [obj]);
        }

        return Qnil;
    });

    klass.define_native_method("[]", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (args[0].klass == Object.find_constant("Range")!) {
            const range = args[0].get_data<Range>();

            Runtime.assert_type(range.begin, IntegerClass);
            Runtime.assert_type(range.end, IntegerClass);

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
            const index = args[0].get_data<number>();

            if (args.length > 1) {
                Runtime.assert_type(args[1], IntegerClass);
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

    const stringify_and_flatten = (elements: RValue[]): string[] => {
        const result = [];

        for (const element of elements) {
            if (element.klass === StringClass) {
                result.push(element.get_data<string>());
            } else if (element.klass === ArrayClass) {
                result.push(...stringify_and_flatten(element.get_data<RubyArray>().elements));
            } else {
                result.push(Object.send(element, "to_s").get_data<string>());
            }
        }

        return result;
    }

    klass.define_native_method("join", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        const separator = args[0] || ExecutionContext.current.globals["$,"];
        const separator_str = separator.is_truthy() ? separator.get_data<string>() : "";
        const result = stringify_and_flatten(self.get_data<RubyArray>().elements).join(separator_str);
        return String.new(result);
    });

    klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
        for (const elem of self.get_data<RubyArray>().elements) {
            if (Object.send(elem, "==", args).is_truthy()) {
                return Qtrue;
            }
        }

        return Qfalse;
    });

    klass.define_native_method("pop", (self: RValue, args: RValue[]): RValue => {
        return self.get_data<RubyArray>().elements.pop() || Qnil;
    });

    klass.define_native_method("shift", (self: RValue, args: RValue[]): RValue => {
        let count = 1;

        if (args.length > 0) {
            Runtime.assert_type(args[0], IntegerClass);
            count = args[0].get_data<number>();
        }

        const elements = self.get_data<RubyArray>().elements;

        // a count of 0 should return an empty array
        if (count === 1) {
            return elements.shift() || Qnil;
        } else {
            return RubyArray.new(elements.splice(0, count));
        }
    });

    klass.define_native_method("unshift", (self: RValue, args: RValue[], _kwargs?: Kwargs, _block?: RValue, call_data?: MethodCallData): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
            for (const arg of args) {
                if (arg.klass === ArrayClass) {
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

    klass.define_native_method("+", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ArrayClass);
        return RubyArray.new(self.get_data<RubyArray>().elements.concat(args[0].get_data<RubyArray>().elements));
    });

    klass.define_native_method("<<", (self: RValue, args: RValue[]): RValue => {
        self.get_data<RubyArray>().elements.push(args[0]);
        return self;
    });

    klass.define_native_method("push", (self: RValue, args: RValue[], _kwargs?: Kwargs, _block?: RValue, call_data?: MethodCallData): RValue => {
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

    klass.define_native_method("size", (self: RValue): RValue => {
        return Integer.get(self.get_data<RubyArray>().elements.length);
    });

    klass.alias_method("length", "size");

    klass.define_native_method("first", (self: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;

        if (elements.length > 0) {
            return elements[0];
        } else {
            return Qnil;
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

    klass.define_native_method("dup", (self: RValue): RValue => {
        return RubyArray.new([...self.get_data<RubyArray>().elements]);
    });

    klass.define_native_method("concat", (self: RValue, args: RValue[]): RValue => {
        args.forEach((arg) => Runtime.assert_type(arg, ArrayClass));
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

    klass.define_native_method("compact", (self: RValue): RValue => {
        const result: RValue[] = [];

        for (const element of self.get_data<RubyArray>().elements) {
            if (element !== Qnil) {
                result.push(element);
            }
        }

        return RubyArray.new(result);
    });

    klass.define_native_method("dup", (self: RValue): RValue => {
        return RubyArray.new([...self.get_data<RubyArray>().elements]);
    });

    klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ArrayClass);
        const other = args[0];
        self.get_data<RubyArray>().elements = [...other.get_data<RubyArray>().elements];
        return self;
    });

    klass.alias_method("initialize_copy", "replace");

    klass.define_native_method("hash", (self: RValue): RValue => {
        const elements = self.get_data<RubyArray>().elements;
        let hash = elements.length;

        for (const element of elements) {
            const elem_hash = Object.send(element, "hash");
            Runtime.assert_type(elem_hash, IntegerClass);
            hash = hash_combine(hash, elem_hash.get_data<number>());
        }

        return Integer.get(hash);
    });

    const add_tuple_to_hash = (tuple: RValue, idx: number, hash: Hash) => {
        if (tuple.klass === ArrayClass) {
            const elements = tuple.get_data<RubyArray>().elements;

            if (elements.length === 2) {
                hash.set(elements[0], elements[1]);
            } else {
                throw new ArgumentError(`wrong array length at ${idx} (expected 2, was ${elements.length})`);
            }
        } else {
            throw new TypeError(`wrong element type ${tuple.klass.get_data<Class>().name} (expected array)`);
        }
    }

    klass.define_native_method("to_h", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const hash = new Hash();
        const elements = self.get_data<RubyArray>().elements;

        if (block) {
            const proc = block.get_data<Proc>();
            let idx = 0;

            try {
                for (idx = 0; idx < elements.length; idx ++) {
                    const tuple = proc.call(ExecutionContext.current, [elements[idx]]);
                    add_tuple_to_hash(tuple, idx, hash);
                }
            } catch (e) {
                if (e instanceof BreakError) {
                    add_tuple_to_hash(e.value, idx, hash);
                } else {
                    throw e;
                }
            }
        } else {
            for (let idx = 0; idx < elements.length; idx ++) {
                add_tuple_to_hash(elements[idx], idx, hash);
            }
        }

        return Hash.from_hash(hash);
    });

    klass.define_native_method("reverse", (self: RValue): RValue => {
        return RubyArray.new([...self.get_data<RubyArray>().elements].reverse());
    });

    klass.define_native_method("reverse!", (self: RValue): RValue => {
        self.get_data<RubyArray>().elements.reverse();
        return self;
    });

    inited = true;
};
