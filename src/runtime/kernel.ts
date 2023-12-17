import { isNode } from "../env";
import { ArgumentError, RubyError, RuntimeError, TypeError } from "../errors";
import { Array, Module, Object, Qfalse, Qnil, Qtrue, RValue, StringClass, String, Runtime, ClassClass, ModuleClass, Class, KernelModule, IntegerClass, ArrayClass } from "../runtime";
import { Integer } from "./integer";

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

    if (isNode) {
        child_process = await import("child_process");
    }

    mod.define_native_method("puts", kernel_puts);
    mod.define_native_singleton_method("puts", kernel_puts);

    mod.define_native_method("require", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, StringClass);
        return Runtime.require(path.get_data<string>()) ? Qtrue : Qfalse;
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

    mod.define_native_method("raise", (_self: RValue, args: RValue[]): RValue => {
        const error = args[0].get_data<RubyError>();
        throw error;
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
        if (args[0].klass == IntegerClass) {
            return args[0];
        } else if (args[0].klass == StringClass) {
            const str = args[0].get_data<string>();

            if (str.match(/^\d+$/)) {
                return Integer.get(parseInt(str));
            }
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
};
