import { isNode } from "../env";
import { ArgumentError, NotImplementedError, RubyError, RuntimeError, SystemExit, TypeError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Array, Module, Qfalse, Qnil, Qtrue, RValue, StringClass, String, Runtime, ClassClass, ModuleClass, Class, KernelModule, IntegerClass, ArrayClass, InterpretedCallable, Callable, HashClass, SymbolClass, FloatClass } from "../runtime";
import { vmfs } from "../vmfs";
import { Integer } from "./integer";
import { Object } from "./object";

const kernel_puts = (_self: RValue, args: RValue[]): RValue => {
    for (let arg of args) {
        console.log(Object.send(arg, "to_s").get_data<string>());
    }

    return Qnil;
};

export class Kernel {
    public static exit_handlers: RValue[] = [];

    static is_a(obj: RValue, mod: RValue): boolean {
        let found = false;

        Runtime.each_unique_ancestor(obj.klass, (ancestor) => {
            if (mod == ancestor) {
                found = true;
                return false;
            }

            return true;
        });

        return found;
    }
}

export const init = async () => {
    const mod = KernelModule.get_data<Module>();
    let child_process: unknown;
    let kexec: (executable: string, args?: string[]) => never;

    if (isNode) {
        // child_process = await import("child_process");

        // @ts-ignore
        // kexec = (await import("@gongt/kexec")).default;
    }

    mod.define_native_method("puts", kernel_puts);
    mod.define_native_singleton_method("puts", kernel_puts);

    mod.define_native_method("require", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, StringClass);
        return Runtime.require(path.get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("require_relative", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, StringClass);
        return Runtime.require_relative(path.get_data<string>(), ExecutionContext.current.frame!.iseq.file) ? Qtrue : Qfalse;
    });

    mod.define_native_method("load", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, StringClass);
        return Runtime.load(path.get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        const obj = args[0];

        if (obj.klass == ClassClass || obj.klass == ModuleClass) {
            if (self.klass.get_data<Class>() == obj.get_data<Class>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        } else {
            return Qfalse;
        }
    });

    mod.define_native_method("<=>", (_self: RValue, _args: RValue[]): RValue => {
        return Qnil;
    });

    mod.define_native_method("is_a?", (self: RValue, args: RValue[]): RValue => {
        const target = args[0];

        if (target.klass == ClassClass || target.klass == ModuleClass) {
            return Kernel.is_a(self, target) ? Qtrue : Qfalse;
        } else {
            throw new TypeError("class or module required");
        }
    });

    mod.define_native_method("instance_of?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ClassClass);
        return self.klass === args[0] ? Qtrue : Qfalse;
    });

    mod.alias_method("kind_of?", "instance_of?");

    mod.define_native_method("raise", (_self: RValue, args: RValue[]): RValue => {
        let instance;

        switch (args[0].klass) {
            case ClassClass:
                instance = Object.send(args[0], "new", [args[1] || Qnil]);
                break;

            case StringClass:
                instance = Object.send(Runtime.constants["RuntimeError"], "new", [args[0]]);
                break;

            default:
                instance = args[0];
        }

        Object.send(instance, "set_backtrace", [ExecutionContext.current.create_backtrace_rvalue()]);

        throw instance;
    });

    mod.define_native_method("respond_to?", (self: RValue, args: RValue[]): RValue => {
        if (Object.find_method_under(self.klass, args[0].get_data<string>())) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    });

    mod.define_native_method("at_exit", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (block) {
            Kernel.exit_handlers.unshift(block);
            return block;
        }

        throw new ArgumentError("at_exit called without a block");
    });

    mod.define_native_method("`", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (!isNode) {
            throw new RuntimeError("backticks are only supported in nodejs");
        }

        const result = (child_process as typeof import("child_process")).spawnSync(args[0].get_data<string>());
        return String.new(result.stdout.toString('utf-8')); // hopefully utf-8 is ok
    });

    mod.define_native_method("class", (self: RValue): RValue => {
        return self.klass;
    });

    mod.define_native_method("Integer", (self: RValue, args: RValue[]): RValue => {
        switch (args[0].klass) {
            case IntegerClass:
                return args[0];

            case FloatClass:
                return Integer.get(Math.floor(args[0].get_data<number>()));

            case StringClass:
                const str = args[0].get_data<string>();

                if (str.match(/^\d+$/)) {
                    return Integer.get(parseInt(str));
                }

                break;
        }

        const arg_str = Object.send(args[0], "inspect").get_data<string>();
        throw new ArgumentError(`invalid value for Integer(): ${arg_str}`);
    });

    mod.define_native_method("Array", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass == ArrayClass) {
            return args[0];
        } else if (Object.send(args[0], "respond_to?", [Runtime.intern("to_ary")]).is_truthy()) {
            return Object.send(args[0], "to_ary");
        } else if (Object.send(args[0], "respond_to?", [Runtime.intern("to_a")]).is_truthy()) {
            return Object.send(args[0], "to_a");
        } else {
            return Array.new([args[0]]);
        }
    });

    mod.define_native_method("instance_variable_get", (self: RValue, args: RValue[]): RValue => {
        return self.iv_get(Object.send(args[0], "to_s").get_data<string>());
    });

    mod.define_native_method("lambda", (self: RValue, args: RValue[], block?: RValue): RValue => {
        if (!block) {
            throw new ArgumentError("tried to create a Proc object without a block");
        }

        return block;
    });

    mod.define_native_method("object_id", (self: RValue): RValue => {
        return Integer.get(self.object_id);
    });

    mod.alias_method("__id__", "object_id");

    mod.define_native_method("instance_variable_set", (self: RValue, args: RValue[]): RValue => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === StringClass || first_arg.klass === SymbolClass) {
            const ivar_name = first_arg.get_data<string>();
            self.iv_set(ivar_name, args[1]);
            return args[1];
        } else {
            throw new TypeError(`${Object.send(args[1], "inspect").get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("instance_variable_get", (self: RValue, args: RValue[]): RValue => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === StringClass || first_arg.klass === SymbolClass) {
            const ivar_name = first_arg.get_data<string>();
            return self.iv_get(ivar_name);
        } else {
            throw new TypeError(`${Object.send(args[1], "inspect").get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("exit", (self: RValue, args: RValue[]): RValue => {
        let status = 0;
        let message = null;

        if (args.length > 0) {
            Runtime.assert_type(args[0], IntegerClass);
            status = args[0].get_data<number>();
        }

        if (args.length > 1) {
            // ugh wtf
            message = args[0].get_data<any>();
        }

        throw new SystemExit(status, message);
    });

    mod.define_native_method("abort", (self: RValue, args: RValue[]): RValue => {
        const msg = args.length > 0 ? args[0].get_data<any>() : null;
        throw new SystemExit(1, msg);
    });

    mod.define_native_method("exec", (self: RValue, args: RValue[]): RValue => {
        if (!isNode) {
            throw new RuntimeError("Kernel#exec is only supported in nodejs");
        }

        const first_arg = args[0] || Qnil;

        if (first_arg.klass === StringClass) {
            if (args[1]) {
                if (args[1].klass === ArrayClass) {
                    const elems = args[1].get_data<Array>().elements;
                    elems.forEach((elem) => Runtime.assert_type(elem, StringClass));
                    const elem_strings = elems.map((elem) => elem.get_data<string>());
                    kexec(first_arg.get_data<string>(), elem_strings);
                } else {
                    throw new NotImplementedError(`unexpected ${first_arg.get_data<Class>().name} passed as the first argument to Kernel#exec`);
                }
            } else {
                kexec(first_arg.get_data<string>());
            }
        } else if (first_arg.klass === HashClass) {
            throw new NotImplementedError("passing a hash as the first argument to Kernel#exec is not yet supported");
        } else if (first_arg.klass === ArrayClass) {
            const elems = args[0].get_data<Array>().elements;
            elems.forEach((elem) => Runtime.assert_type(elem, StringClass));
            const elem_strings = elems.map((elem) => elem.get_data<string>());
            console.log(elem_strings);
            kexec(elem_strings.join(" "));
        } else {
            throw new ArgumentError(`unexpected ${first_arg.klass.get_data<Class>().name} passed as the first argument to Kernel#exec`);
        }
    });

    mod.define_native_method("__dir__", (self: RValue, args: RValue[]): RValue => {
        return String.new(vmfs.dirname(ExecutionContext.current.frame!.iseq.file));
    });

    mod.define_native_method("nil?", (self: RValue): RValue => {
        return self === Qnil ? Qtrue : Qfalse;
    });

    mod.define_native_method("singleton_class", (self: RValue): RValue => {
        // @TODO: this needs to be smarter
        return self.get_singleton_class();
    });
};
