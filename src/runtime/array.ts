import { String, Runtime, RValue, Object, ObjectClass, Class } from "../runtime";

export abstract class Array {
    static new(arr?: RValue[]): RValue {
        return new RValue(ArrayClass.get_data<Class>(), arr || []);
    }
}

export const ArrayClass = Runtime.define_class("Array", ObjectClass, (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        const elements = self.get_data<RValue[]>();

        const strings = elements.map( (element: RValue): string => {
            return Object.send(element, "inspect").get_data<string>();
        });

        return String.new(`[${strings.join(", ")}]`);
    })
});
