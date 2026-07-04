import { ArgumentError, TypeError } from "../errors";
import { Class, ClassClass, ObjectClass, Qnil, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object";
import { RubyString } from "../runtime/string";
import { Symbol } from "../runtime/symbol";
import { Args } from "./arg-scanner";

let inited = false;

type StructContext = {
    fields?: Map<string, RValue>
}

export const init = async () => {
    if (inited) return;

    await Runtime.define_class("Struct", ObjectClass, async (struct_class: Class) => {
        struct_class.define_native_singleton_method("new", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let new_class;
            const field_names: string[] = [];
            let field_start_index = 0;

            // If the first argument is a string, it is used as the struct's class name and
            // added as a constant on Struct::, eg: Struct.new("Foo")  # => Struct::Foo
            if (args.length > 0 && args[0].klass === await RubyString.klass()) {
                const class_name = args[0].get_data<string>();
                new_class = new Class(class_name, struct_class.rval, false, struct_class.rval);
                field_start_index = 1;

                for (let i = 1; i < args.length; i ++) {
                    const field_name = await Runtime.coerce_to_string(args[i]);
                    field_names.push(field_name.get_data<string>());
                }
            } else {
                new_class = new Class(null, struct_class.rval);

                for (let i = 0; i < args.length; i ++) {
                    const field_name = await Runtime.coerce_to_string(args[i]);
                    field_names.push(field_name.get_data<string>());
                }
            }

            const new_class_rval = new RValue(ClassClass, new_class);
            new_class.rval = new_class_rval;

            // add the constant to Struct's child class list
            if (args.length > 0 && args[0].klass === await RubyString.klass()) {
                const class_name = args[0].get_data<string>();
                struct_class.constants[class_name] = new_class_rval;
            }

            new_class.define_native_singleton_method("new", (_self: RValue, args: RValue[]): RValue => {
                const new_instance = new RValue(new_class_rval);

                if (args.length > field_names.length) {
                    throw new ArgumentError("struct size differs");
                }

                const context = new_instance.get_context<StructContext>();

                if (context.fields === undefined) {
                    context.fields = new Map();
                }

                for (let i = 0; i < field_names.length; i ++) {
                    context.fields.set(field_names[i], args[i] || Qnil);
                }

                return new_instance;
            });

            for (let i = field_start_index; i < args.length; i ++) {
                if (args[i].klass !== await Symbol.klass()) {
                    throw new TypeError(`${(await Object.send(args[i], "inspect")).get_data<string>()} is not a symbol`);
                }

                const field = field_names[i - field_start_index];

                new_class.define_native_method(field, (self: RValue): RValue => {
                    const context = self.get_context<StructContext>();
                    return context.fields!.get(field) || Qnil;
                });

                new_class.define_native_method(`${field}=`, (self: RValue, args: RValue[]): RValue => {
                    const context = self.get_context<StructContext>();
                    context.fields!.set(field, args[0]);
                    return args[0];
                });
            }

            return new_class_rval;
        });

        struct_class.define_native_method("initialize_copy", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);
            const self_context = self.get_context<StructContext>();
            const other_context = other.get_context<StructContext>();

            self_context.fields = new Map();

            for (const [key, value] of other_context.fields!.entries()) {
                self_context.fields!.set(key, value);
            }

            return self;
        });

        struct_class.define_native_method("inspect", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const parts = ["#<struct"];

            if (self.klass.get_data<Class>().name) {
                parts.push(self.klass.get_data<Class>().name!);
            }

            const field_inspect_strings: string[] = [];
            const context = self.get_context<StructContext>();

            for (const [key, value] of context.fields!.entries()) {
                const value_inspect_str = await Object.send(value, "inspect");
                field_inspect_strings.push(`${key}=${value_inspect_str.get_data<string>()}`);
            }

            if (field_inspect_strings.length > 0) {
                parts.push(field_inspect_strings.join(", "));
            }

            return await RubyString.new(`${parts.join(" ")}>`);
        });
    });

    inited = true;
}
