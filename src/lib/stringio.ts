import { Class, NilClass, ObjectClass, Qfalse, Qnil, RValue, Runtime } from "../runtime";
import { Integer } from "../runtime/integer";
import { String } from "../runtime/string"
import { Object } from "../runtime/object"
import { NameError } from "../errors";

let inited = false;

export class StringIO {
    static async new() {
        return new RValue(await this.klass(), "");
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("StringIO");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant StringIO`);
        }

        return this.klass_;
    }
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringIO", ObjectClass, async (klass: Class) => {
        // @TODO: also include IO::generic_readable and IO::generic_writable
        klass.include((await Object.find_constant("Enumerable"))!);

        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.data = args.length > 0 ? args[0].get_data<string>() : "";
            return Qnil;
        })

        klass.define_native_method("write", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let val;

            switch (args[0].klass) {
                case NilClass:
                    // writing nil should append an empty string, i.e. do nothing
                    return Integer.get(0);
                case await String.klass():
                    val = args[0].get_data<string>();
                    self.data = self.get_data<string>() + val;
                    return await Integer.get((await String.get_encoding(args[0])).bytesize(val));
                default:
                    val = await Object.send(args[0], "inspect");
                    self.data = self.get_data<string>() + val.get_data<string>();
                    return await Integer.get((await String.get_encoding(val)).bytesize(val.get_data<string>()));
            }
        });

        klass.define_native_method("puts", async (self: RValue, args: RValue[]): Promise<RValue> => {
            for (const arg of args) {
                self.data += (await Object.send(arg, "to_s")).get_data<string>();
            }

            self.data += "\n";
            return Qnil;
        });

        klass.define_native_method("string", async (self: RValue): Promise<RValue> => {
            // @TODO: handle string encoding
            return await String.new(self.get_data<string>());
        });

        klass.define_native_method("isatty", (self: RValue): RValue => {
            return Qfalse;
        });
    });

    inited = true;
}
