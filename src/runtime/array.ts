import { Array, Class, Object, Qnil, RValue, String } from "../runtime";

export const defineArrayBehaviorOn = (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        const elements = self.get_data<RValue[]>();

        const strings = elements.map( (element: RValue): string => {
            return Object.send(element, "inspect").get_data<string>();
        });

        return String.new(`[${strings.join(", ")}]`);
    });

    klass.define_native_method("each", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (block) {
            const elements = self.get_data<RValue[]>();

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
            const elements = self.get_data<RValue[]>();
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
};
