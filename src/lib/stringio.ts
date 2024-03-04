import { Class, NilClass, Object, Qnil, Runtime, StringClass } from "../garnet";
import { ObjectClass, RValue } from "../runtime";
import { Integer } from "../runtime/integer";
import { String } from "../runtime/string"

let inited = false;

export class StringIO {
    static new() {
        return new RValue(Object.find_constant("StringIO")!, "");
    }
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringIO", ObjectClass, (klass: Class) => {
        // @TODO: also include IO::generic_readable and IO::generic_writable
        klass.include(Object.find_constant("Enumerable")!);

        klass.define_native_method("write", (self: RValue, args: RValue[]): RValue => {
            let val;

            switch (args[0].klass) {
                case NilClass:
                    // writing nil should append an empty string, i.e. do nothing
                    return Integer.get(0);
                case StringClass:
                    val = args[0].get_data<string>();
                    self.data = self.get_data<string>() + val;
                    return Integer.get(String.get_encoding(args[0]).bytesize(val));
                default:
                    val = Object.send(args[0], "inspect");
                    self.data = self.get_data<string>() + val.get_data<string>();
                    return Integer.get(String.get_encoding(val).bytesize(val.get_data<string>()));
            }
        });

        klass.define_native_method("string", (self: RValue): RValue => {
            // @TODO: handle string encoding
            return String.new(self.get_data<string>());
        });
    });

    inited = true;
}
