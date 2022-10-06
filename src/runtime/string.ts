import { Class, Integer, Qnil, RValue, StringClass, String, IntegerClass } from "../runtime";
import { hash_string } from "../string_utils";

export const defineStringBehaviorOn = (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
        const str = args[0];

        if (str) {
            str.assert_type(StringClass);
            self.data = str.data;
        }

        return Qnil;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        return self;
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        return String.new(`"${str.replace(/\"/g, "\\\"")}"`);
    });

    klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
        const multiplier = args[0];
        multiplier.assert_type(IntegerClass);  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
        return String.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
    });
};
