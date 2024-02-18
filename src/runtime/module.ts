import { MethodCallData } from "../call_data";
import { Compiler } from "../compiler";
import { ArgumentError, NameError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Array, Module, ModuleClass, RValue, Runtime, SymbolClass, Visibility, Qnil, StringClass, Class, Qtrue, Qfalse, NativeCallable, ClassClass, IntegerClass, Kwargs } from "../runtime";
import { Kernel } from "./kernel";
import { Object } from "./object";
import { Proc } from "./proc";
import { String } from "../runtime/string";

let inited = false;

export const init = () => {
    if (inited) return;

    const mod = Object.find_constant("Module")!.get_data<Module>();

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

        Runtime.each_unique_ancestor(self, true, (ancestor: RValue): boolean => {
            result.push(ancestor);
            return true;
        });

        return Array.new(result);
    });

    mod.define_native_method("include", (self: RValue, args: RValue[]): RValue => {
        for (const module of args) {
            Runtime.assert_type(module, ModuleClass);
            self.get_data<Module>().include(module);
        }

        return self;
    });

    mod.define_native_method("prepend", (self: RValue, args: RValue[]): RValue => {
        for (const module of args) {
            Runtime.assert_type(module, ModuleClass);
            self.get_data<Module>().prepend(module);
        }

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
        self.get_data<Module>().alias_method(new_method_name, existing_method_name);
        return Runtime.intern(new_method_name);
    });

    mod.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return Kernel.is_a(args[0], self) ? Qtrue : Qfalse;
    });

    mod.define_native_method("class_eval", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        if (block) {
            const proc = block!.get_data<Proc>();
            const binding = proc.binding.with_self(self);
            return proc.with_binding(binding).call(ExecutionContext.current, []);
        } else {
            Runtime.assert_type(args[0], StringClass);
            const code = args[0].get_data<string>();
            const ec = ExecutionContext.current;
            let path, line_offset;

            if (args[1]) {
                path = Runtime.coerce_to_string(args[1]).get_data<string>();
            } else {
                path = `(eval at ${ec.frame!.iseq.file}:${ec.frame!.line})`;
            }

            if (args[2]) {
                Runtime.assert_type(args[2], IntegerClass);
                line_offset = args[2].get_data<number>() - 1;  // convert line to offset
            } else {
                line_offset = 0;
            }

            const iseq = Compiler.compile_string(code, path, line_offset);
            return ExecutionContext.current.run_class_frame(iseq, self);
        }
    });

    mod.define_native_method("define_method", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue): RValue => {
        Runtime.assert_type(args[0], SymbolClass);
        const method_name = args[0].get_data<string>();

        if (!block) {
            throw new ArgumentError("Module.define_method does not yet support being called without a block");
        }

        self.get_data<Module>().define_native_method(method_name, (mtd_self: RValue, mtd_args: RValue[], mtd_kwargs?: Kwargs, mtd_block?: RValue, call_data?: MethodCallData): RValue => {
            if (mtd_block) {
                mtd_args = [...mtd_args, mtd_block];
            }

            if (call_data) {
                call_data = MethodCallData.create("instance_exec", mtd_args.length, call_data.flag, call_data.kw_arg)
                return Object.send(mtd_self, call_data, mtd_args, mtd_kwargs, block);
            } else {
                return Object.send(mtd_self, "instance_exec", args, kwargs, block);
            }
        });

        return args[0];
    });

    mod.define_native_method("remove_method", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Module>().remove_method(Runtime.coerce_to_string(args[0]).get_data<string>());
        return self;
    });

    mod.define_native_method("undef_method", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Module>().undef_method(Runtime.coerce_to_string(args[0]).get_data<string>());
        return self;
    });

    mod.define_native_method("private_constant", (self: RValue, args: RValue[]): RValue => {
        // @TODO: actually make constant private (what does that even mean??)
        return self;
    });

    mod.define_native_method("module_function", (self: RValue, args: RValue[]): RValue => {
        const mod = self.get_data<Module>();

        for (const arg of args) {
            const name = Runtime.coerce_to_string(arg).get_data<string>();
            const method = Object.find_method_under(self, name, true);

            if (method) {
                mod.get_singleton_class().get_data<Class>().methods[name] = method;
            } else {
                throw new NameError(`undefined method \`${name}' for module \`${mod.name}'`);
            }
        }

        if (args.length === 1) {
            return args[0]
        } else {
            return Array.new(args);
        }
    });

    mod.define_native_method("deprecate_constant", (self: RValue, args: RValue[]): RValue => {
        const mod = self.get_data<Module>();

        for (const arg of args) {
            const name = Runtime.coerce_to_string(arg).get_data<string>();
            const constant = mod.constants[name];

            if (!constant) {
                throw new NameError(`constant ${name} not defined`);
            }

            mod.deprecate_constant(name, constant);
        }

        return self;
    });

    mod.define_native_method("nesting", (self: RValue): RValue => {
        return Array.new(ExecutionContext.current.frame?.nesting || []);
    });

    inited = true;
};

const define_attr_reader_on = (mod: RValue, name: string): string => {
    mod.get_data<Module>().define_native_method(name, (self: RValue): RValue => {
        return self.iv_get(`@${name}`);
    });

    return name;
}

const define_attr_writer_on = (mod: RValue, name: string): string => {
    const mtd_name = `${name}=`;

    mod.get_data<Module>().define_native_method(mtd_name, (self: RValue, args: RValue[]): RValue => {
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
