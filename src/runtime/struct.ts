import { ArgumentError, TypeError } from "../errors";
import { Class, ClassClass, ObjectClass, Qnil, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object";
import { String } from "../runtime/string";
import { Symbol } from "../runtime/symbol";

let inited = false;

type StructContext = {
    fields?: Map<string, RValue>
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("Struct", ObjectClass, (struct_class: Class) => {
        struct_class.define_native_singleton_method("new", (self: RValue, args: RValue[]): RValue => {
            let new_class;
            const field_names: string[] = [];

            // If the first argument is a string, it is used as the struct's class name and
            // added as a constant on Struct::, eg: Struct.new("Foo")  # => Struct::Foo
            if (args[0].klass === String.klass) {
                const class_name = args[0].get_data<string>();
                new_class = new Class(class_name, struct_class.rval);
                struct_class.constants[class_name] = new_class.rval;

                for (let i = 1; i < args.length; i ++) {
                    field_names.push(Runtime.coerce_to_string(args[i]).get_data<string>());
                }
            } else {
                new_class = new Class(null, struct_class.rval);

                for (let i = 0; i < args.length; i ++) {
                    field_names.push(Runtime.coerce_to_string(args[i]).get_data<string>());
                }
            }

            const new_class_rval = new RValue(ClassClass, new_class);

            new_class.define_native_singleton_method("new", (self: RValue, args: RValue[]): RValue => {
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

            for (let i = 0; i < args.length; i ++) {
                if (args[i].klass !== Symbol.klass) {
                    throw new TypeError(`${Object.send(args[i], "inspect").get_data<string>()} is not a symbol`);
                }

                const field = field_names[i];

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
    });

    inited = true;
}
