import { ExecutionContext } from "../execution_context";
import { Array, ArrayClass, Class, IntegerClass, Object, Qfalse, Qnil, Qtrue, RValue, Runtime, String, StringClass } from "../runtime";

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

            for (let element of elements) {
                Object.send(block, "call", [element]);
            }
        } else {
            // @TODO: return an Enumerator
        }

        return self;
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

    klass.define_native_method("unshift", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Array>().elements.unshift(...args);
        return self;
    });
};
