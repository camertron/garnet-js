import { Array as RubyArray, Class, Integer, Qnil, RValue, StringClass, String, IntegerClass, Runtime } from "../runtime";
import { hash_string } from "../util/string_utils";

export const defineStringBehaviorOn = (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
        const str = args[0];

        if (str) {
            Runtime.assert_type(str, StringClass);
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
        Runtime.assert_type(multiplier, IntegerClass);  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
        return String.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
    });

    klass.define_native_method("split", (self: RValue, args: RValue[]): RValue => {
        let delim;

        if (args.length > 0) {
            delim = args[0].get_data<string>();
        } else {
            delim = " ";
        }

        const str = self.get_data<string>();

        return RubyArray.new(str.split(delim).map((elem) => String.new(elem)));
    });
};
