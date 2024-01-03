import { CallDataFlag, MethodCallData } from "../call_data";
import { ExecutionContext } from "../execution_context";
import { Array, ArrayClass, Class, IntegerClass, Qfalse, Qnil, Qtrue, RValue, Runtime, String, StringClass } from "../runtime";
import { Integer } from "./integer";
import { Object } from "./object";

export const defineArrayBehaviorOn = (klass: Class) => {
    klass.include(Runtime.constants["Enumerable"]);

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const elements = self.get_data<Array>().elements;

        const strings = elements.map( (element: RValue): string => {
            return Object.send(element, "inspect").get_data<string>();
        });

        return String.new(`[${strings.join(", ")}]`);
    });

    klass.define_native_method("each", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (block) {
            const elements = self.get_data<Array>().elements;

            for (const element of elements) {
                Object.send(block, "call", [element]);
            }
        } else {
            // @TODO: return an Enumerator
        }

        return self;
    });

    klass.define_native_method("index", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;

        if (block) {
            for (let i = 0; i < elements.length; i ++) {
                if (Object.send(block, "call", [elements[i]]).is_truthy()) {
                    return Integer.get(i);
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

    klass.define_native_method("all?", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;

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

    klass.define_native_method("[]", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;
        const index = args[0].get_data<number>();

        if (args.length > 1) {
            Runtime.assert_type(args[1], IntegerClass);
            const length = args[1].get_data<number>();
            return Array.new(elements.slice(index, index + length));
        } else {
            return elements[index] || Qnil;
        }
    });

    // @TODO: fill array with Qnils
    klass.define_native_method("[]=", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;
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
                result.push(...stringify_and_flatten(element.get_data<Array>().elements));
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
        const result = stringify_and_flatten(self.get_data<Array>().elements).join(separator_str);
        return String.new(result);
    });

    klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
        for (const elem of self.get_data<Array>().elements) {
            if (Object.send(elem, "==", args).is_truthy()) {
                return Qtrue;
            }
        }

        return Qfalse;
    });

    klass.define_native_method("pop", (self: RValue, args: RValue[]): RValue => {
        return self.get_data<Array>().elements.pop() || Qnil;
    });

    klass.define_native_method("shift", (self: RValue, args: RValue[]): RValue => {
        let count = 1;

        if (args.length > 0) {
            Runtime.assert_type(args[0], IntegerClass);
            count = args[0].get_data<number>();
        }

        const elements = self.get_data<Array>().elements;

        // a count of 0 should return an empty array
        if (count === 1) {
            return elements.shift() || Qnil;
        } else {
            return Array.new(elements.splice(0, count));
        }
    });

    klass.define_native_method("unshift", (self: RValue, args: RValue[], block?: RValue, call_data?: MethodCallData): RValue => {
        const elements = self.get_data<Array>().elements;

        if (call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
            for (const arg of args) {
                if (arg.klass === ArrayClass) {
                    elements.unshift(...arg.get_data<Array>().elements);
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
        return Array.new(self.get_data<Array>().elements.concat(args[0].get_data<Array>().elements));
    });

    klass.define_native_method("<<", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Array>().elements.push(args[0]);
        return self;
    });

    klass.define_native_method("push", (self: RValue, args: RValue[], block?: RValue, call_data?: MethodCallData): RValue => {
        const elements = self.get_data<Array>().elements;

        // this is wrong but I don't know how to fix it, since I need to know which args are splatted
        // but that info is not available right now. We'll need to capture more info in CallData.
        if (call_data && call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
            for (const arg of args) {
                elements.push(...arg.get_data<Array>().elements);
            }
        } else {
            elements.push(...args);
        }

        return self;
    });

    klass.define_native_method("size", (self: RValue): RValue => {
        return Integer.get(self.get_data<Array>().elements.length);
    });

    klass.define_native_method("dup", (self: RValue): RValue => {
        return Array.new([...self.get_data<Array>().elements]);
    });

    klass.define_native_method("concat", (self: RValue, args: RValue[]): RValue => {
        args.forEach((arg) => Runtime.assert_type(arg, ArrayClass));
        const elements = self.get_data<Array>().elements;
        args.forEach((arg) => elements.push(...arg.get_data<Array>().elements));
        return self;
    });

    klass.define_native_method("empty?", (self: RValue): RValue => {
        return self.get_data<Array>().elements.length === 0 ? Qtrue : Qfalse;
    });

    klass.define_native_method("clear", (self: RValue): RValue => {
        const elements = self.get_data<Array>().elements;
        elements.splice(0, elements.length);
        return self;
    });

    klass.define_native_method("compact", (self: RValue): RValue => {
        const result: RValue[] = [];

        for (const element of self.get_data<Array>().elements) {
            if (element !== Qnil) {
                result.push(element);
            }
        }

        return Array.new(result);
    });

    klass.define_native_method("dup", (self: RValue): RValue => {
        return Array.new([...self.get_data<Array>().elements]);
    });

    klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ArrayClass);
        const other = args[0];
        self.get_data<Array>().elements = [...other.get_data<Array>().elements];
        return self;
    });

    klass.alias_method("initialize_copy", "replace");
};
