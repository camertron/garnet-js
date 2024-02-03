import { Class, NumericClass, RValue, Runtime, Float } from "../runtime";
import { String } from "../runtime/string";

let inited = false;

export const init = () => {
    if (inited) return;

    const klass = Runtime.constants["Float"].get_data<Class>();

    klass.define_native_method("inspect", (self: RValue): RValue => {
        return String.new(self.get_data<number>().toString());
    });

    klass.define_native_method("/", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], NumericClass);
        return Float.new(self.get_data<number>() / args[0].get_data<number>());
    });

    klass.define_native_method("-", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], NumericClass);
        return Float.new(self.get_data<number>() - args[0].get_data<number>());
    });

    inited = true;
};
