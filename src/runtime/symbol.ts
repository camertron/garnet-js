import { Class, Qfalse, Qtrue, RValue, String, SymbolClass } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";

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

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass != SymbolClass) return Qfalse;
        return args[0].get_data<string>() === self.get_data<string>() ? Qtrue : Qfalse;
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        return String.new(self.get_data<string>());
    });

    klass.define_native_method("to_sym", (self: RValue): RValue => {
        return self;
    });
};
