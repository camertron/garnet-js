import { Compiler } from "../compiler";
import { LoadError, RubyError, TypeError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Array, Module, Object, Qfalse, Qnil, Qtrue, RValue, StringClass, String, Runtime, ClassClass, ModuleClass, Class } from "../runtime";
import { vmfs } from "../vmfs";

const kernel_puts = (_self: RValue, args: RValue[]): RValue => {
    for (let arg of args) {
        console.log(Object.send(arg, "to_s").get_data<string>());
    }

    return Qnil;
};

const find_on_load_path = (path: string): string | null => {
    const ec = ExecutionContext.current;
    const load_paths = ec.globals["$:"].get_data<Array>().elements;

    for(let load_path of load_paths) {
        const full_path = vmfs.join_paths(load_path.get_data<string>(), `${path}.rb`);

        if (vmfs.path_exists(full_path)) {
            return full_path;
        }
    }

    return null;
};

const resolve_path = (path: string): string | null => {
    // TODO: support relative paths
    return find_on_load_path(path);
}

export const defineKernelBehaviorOn = (mod: Module) => {
    mod.define_native_method("puts", kernel_puts);
    mod.define_native_singleton_method("puts", kernel_puts);

    mod.define_native_method("require", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, StringClass);

        const path_str = path.get_data<string>();
        const ec = ExecutionContext.current;
        const loaded_features = ec.globals['$"'].get_data<Array>().elements;
        const full_path = resolve_path(path_str);

        if (!full_path) {
            throw new LoadError(`cannot load such file -- ${path_str}`);
        }

        // required files are only evaluated once
        for (const loaded_feature of loaded_features) {
            if (loaded_feature.get_data<string>() == full_path) {
                return Qfalse;
            }
        }

        const code = vmfs.read(full_path);
        const insns = Compiler.compile_string(code.toString(), full_path);
        ec.run_top_frame(insns);

        loaded_features.push(String.new(full_path));

        return Qtrue;
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

    mod.define_native_method("is_a?", (self: RValue, args: RValue[]): RValue => {
        const target = args[0];

        if (target.klass == ClassClass || target.klass == ModuleClass) {
            let found = false;

            Runtime.each_unique_ancestor(self.klass, (ancestor) => {
                if (target == ancestor) {
                    found = true;
                    return false;
                }

                return true;
            });

            return found ? Qtrue : Qfalse;
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
};
