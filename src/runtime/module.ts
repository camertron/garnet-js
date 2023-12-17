import { NameError } from "../errors";
import { Array, String, Object, Module, ModuleClass, RValue, Runtime, SymbolClass, Visibility, Qnil, StringClass, Class, Qtrue, Qfalse, NativeCallable, ClassClass } from "../runtime";
import { Kernel } from "./kernel";

export const defineModuleBehaviorOn = (mod: Module) => {
    mod.define_native_method("inspect", (self: RValue): RValue => {
        const mod = self.get_data<Module>();

        if (mod.name) {
            return String.new(mod.name);
        } else {
            return String.new(`#<Module:${Object.object_id_to_str(self.object_id)}>`);
        }
    });

    mod.define_native_method("ancestors", (self: RValue): RValue => {
        const result: RValue[] = [];

        Runtime.each_unique_ancestor(self, (ancestor: RValue): boolean => {
            result.push(ancestor);
            return true;
        });

        return Array.new(result);
    });

    mod.define_native_method("include", (self: RValue, args: RValue[]): RValue => {
        const mod_to_include = args[0];
        Runtime.assert_type(mod_to_include, ModuleClass);
        self.get_data<Module>().include(mod_to_include);
        return self;
    });

    mod.define_native_method("public", (self: RValue, args: RValue[]): RValue => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.public;
        } else {
            Runtime.assert_type(args[0], SymbolClass);
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.public;
        }

        return Qnil;
    });

    mod.define_native_method("private", (self: RValue, args: RValue[]): RValue => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.private;
        } else {
            Runtime.assert_type(args[0], SymbolClass);
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.private;
        }

        return Qnil;
    });

    mod.define_native_method("protected", (self: RValue, args: RValue[]): RValue => {
        if (args.length === 0) {
            self.get_data<Module>().default_visibility = Visibility.protected;
        } else {
            Runtime.assert_type(args[0], SymbolClass);
            const mtd_name = args[0].get_data<string>();
            self.get_data<Module>().methods[mtd_name].visibility = Visibility.private;
        }

        return Qnil;
    });

    mod.define_native_method("const_defined?", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass != StringClass && args[0].klass != SymbolClass) {
            Runtime.assert_type(args[0], StringClass);
        }

        const c = args[0].get_data<string>();
        const found = self.klass.get_data<Class>().find_constant(c);

        return found ? Qtrue : Qfalse;
    });

    mod.define_native_method("attr_reader", (self: RValue, args: RValue[]): RValue => {
        const result: RValue[] = [];

        each_string(args, (arg_s) => {
            result.push(Runtime.intern(define_attr_reader_on(self, arg_s)));
        });

        return Array.new(result);
    });

    mod.define_native_method("attr_writer", (self: RValue, args: RValue[]): RValue => {
        const result: RValue[] = [];

        each_string(args, (arg_s) => {
            result.push(Runtime.intern(define_attr_writer_on(self, arg_s)));
        });

        return Array.new(result);
    });

    mod.define_native_method("attr_accessor", (self: RValue, args: RValue[]): RValue => {
        const result: RValue[] = [];

        each_string(args, (arg_s) => {
            result.push(Runtime.intern(define_attr_writer_on(self, arg_s)));
            result.push(Runtime.intern(define_attr_reader_on(self, arg_s)));
        });

        return Array.new(result);
    });

    mod.define_native_method("alias_method", (self: RValue, args: RValue[]): RValue => {
        const new_method_name = args[0].get_data<string>();
        const existing_method_name = args[1].get_data<string>();

        if (!Object.find_method_under(self, existing_method_name)) {
            const type = self.klass == ClassClass ? "class" : "module";
            throw new NameError(`undefined method \`${existing_method_name}' for ${type} \`${self.get_data<Module>().name}'`)
        }

        self.get_data<Module>().alias_method(new_method_name, existing_method_name);

        return Runtime.intern(new_method_name);
    });

    mod.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return Kernel.is_a(args[0], self) ? Qtrue : Qfalse;
    });
};

const define_attr_reader_on = (mod: RValue, name: string): string => {
    mod.get_data<Module>().methods[name] = new NativeCallable((self: RValue, args: RValue[]): RValue => {
        self.iv_set(`@${name}`, args[0]);
        return args[0];
    });

    return name;
}

const define_attr_writer_on = (mod: RValue, name: string): string => {
    name = `${name}=`;

    mod.get_data<Module>().methods[name] = new NativeCallable((self: RValue, args: RValue[]): RValue => {
        self.iv_set(`@${name}`, args[0]);
        return args[0];
    });

    return name;
}

const each_string = (args: RValue[], callback: (arg: string) => void) => {
    for (const arg of args) {
        if (arg.klass != StringClass && arg.klass != SymbolClass) {
            const arg_s = Object.send(arg, "inspect").get_data<string>();
            throw new TypeError(`${arg_s} is not a symbol nor a string`);
        }

        callback(arg.get_data<string>());
    }
}
