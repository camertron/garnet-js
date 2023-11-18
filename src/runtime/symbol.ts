import { Class, Integer, RValue, String } from "../runtime";
import { hash_string } from "../util/string_utils";

export const defineSymbolBehaviorOn = (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        const quote = !/^\w+$/.test(str);
        const escaped_str = str.replace(/\"/g, "\\\"");

        return String.new(quote ? `:"${escaped_str}"` : `:${escaped_str}`);
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });
};
