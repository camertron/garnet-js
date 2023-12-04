import { Array, Class, Object, Qnil, RValue, String } from "../runtime";

export const defineArrayBehaviorOn = (klass: Class) => {
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

    klass.define_native_method("map", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (block) {
            const elements = self.get_data<Array>().elements;
            const result = [];

            for (let element of elements) {
                result.push(Object.send(block, "call", [element]));
            }

            return Array.new(result);
        } else {
            // @TODO: return an enumerator
        }

        return Qnil;
    });

    klass.define_native_method("[]", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;
        const index = args[0].get_data<number>();

        return elements[index] || Qnil;
    });

    // @TODO: fill array with Qnils
    klass.define_native_method("[]=", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const elements = self.get_data<Array>().elements;
        const index = args[0].get_data<number>();
        const new_value = args[1];

        elements[index] = new_value;
        return new_value;
    });
};
