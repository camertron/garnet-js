import { CallDataFlag, MethodCallData } from "../call_data";
import { ArgumentError, FrozenError, NoMethodError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Callable, Class, ClassClass, KernelModule, ModuleClass, ObjectClass, RValue, Runtime, StringClass, String, SymbolClass, Qtrue, Qfalse, ProcClass, Qnil, Module } from "../runtime";
import { NativeProc } from "./proc";
import { Symbol } from "./symbol";

export class Object {
    static send(receiver: RValue, call_data_: MethodCallData | string, args: RValue[] = [], block?: RValue): RValue {
        let method = null;
        let method_name: string;
        let call_data: MethodCallData | undefined;

        if (call_data_ instanceof MethodCallData) {
            method_name = call_data_.mid;
            call_data = call_data_;
        } else {
            method_name = call_data_;
            call_data = undefined;
        }

        if (receiver.has_singleton_class() && receiver.get_singleton_class().get_data<Class>().methods[method_name]) {
            method = receiver.get_singleton_class().get_data<Class>().methods[method_name];
        } else if (receiver.klass == ClassClass || receiver.klass == ModuleClass) {
            method = Object.find_method_under(receiver.get_data<Class>().get_singleton_class(), method_name);
        } else {
            method = Object.find_method_under(receiver.klass, method_name);
        }

        if (block?.klass === SymbolClass) {
            block = Symbol.to_proc(block);
        }

        if (method) {
            return method.call(
                ExecutionContext.current,
                receiver,
                args,
                block,
                call_data
            );
        } else {
            let method_missing_call_data;

            if (call_data) {
                method_missing_call_data = MethodCallData.create(
                    "method_missing", call_data.argc + 1, call_data.flag, call_data.kw_arg
                );
            } else {
                let flags = CallDataFlag.ARGS_SIMPLE;
                if (block) flags |= CallDataFlag.ARGS_BLOCKARG;
                method_missing_call_data = MethodCallData.create("method_missing", args.length + 1, flags);
            }

            return Object.send(receiver, method_missing_call_data, [String.new(method_name), ...args], block);
        }
    }

    static respond_to(obj: RValue, method_name: string): boolean {
        if (obj.has_singleton_class()) {
            const found = this.find_method_under(obj.get_singleton_class(), method_name);
            if (found) return true;
        }

        return this.find_method_under(obj.klass, method_name) ? true : false;
    }

    static find_method_under(mod: RValue, method_name: string): Callable | null {
        let found_method = null;

        Runtime.each_unique_ancestor(mod, (ancestor: RValue): boolean => {
            const ancestor_mod = ancestor.get_data<Module>();

            if (ancestor_mod.undefined_methods.has(method_name)) {
                // Module.undef_method prevents any calls to the method_name method, regardless of
                // their position in the inheritance chain. Exit early from each_unique_ancestor()
                // by returning false here.
                return false;
            }

            const method = ancestor_mod.methods[method_name];

            // Methods can't be called if they were removed from a particular class, but superclass
            // versions of the same method can still be called. Keep searching the inheritance chain.
            if (method && !ancestor_mod.removed_methods.has(method_name)) {
                found_method = method;

                // A matching method has been found; exit early from each_unique_ancestor().
                return false;
            }

            return true;
        });

        return found_method;
    }

    static object_id_to_str(object_id: number): string {
        const id_str = object_id.toString(16).padStart(16, "0");
        return `0x${id_str}`;
    }

    static check_frozen(obj: RValue) {
        if (obj.is_frozen()) {
            const inspect_str = Object.send(obj, "inspect");
            throw new FrozenError(`can't modify frozen ${obj.klass.get_data<Class>().name}: ${inspect_str}`);
        }
    }
}

export const init = () => {
    (ObjectClass.get_data<Class>()).tap( (klass: Class) => {
        klass.include(KernelModule);

        // NOTE: send should actually be defined by the Kernel module
        klass.define_native_singleton_method("send", (self: RValue, args: RValue[]): RValue => {
            const method_name = args[0];
            Runtime.assert_type(method_name, StringClass);
            return Object.send(self.klass.get_data<Class>().get_singleton_class(), method_name.get_data<string>(), args);
        });

        klass.define_native_method("send", (self: RValue, args: RValue[], block?: RValue, call_data?: MethodCallData) => {
            const method_name = args[0];

            if (method_name.klass === StringClass || method_name.klass === SymbolClass) {
                if (call_data) {
                    const new_call_data = MethodCallData.create(method_name.get_data<string>(), call_data.argc - 1, call_data.flag, call_data.kw_arg);
                    return Object.send(self, new_call_data, args.slice(1), block);
                } else {
                    return Object.send(self, method_name.get_data<string>(), args.slice(1), block);
                }
            } else {
                throw new TypeError(`${Object.send(method_name, "inspect").get_data<string>()} is not a symbol nor a string`);
            }
        });

        klass.define_native_method("inspect", (self: RValue): RValue => {
            const class_name = self.klass.get_data<Class>().name;
            const name = class_name ? class_name : "Class";
            let parts = [`${name}:${Object.object_id_to_str(self.object_id)}`];

            if (self.ivars) {
                for (const ivar_name of self.ivars.keys()) {
                    const ivar = self.iv_get(ivar_name);
                    const inspect_str = Object.send(ivar, "inspect").get_data<string>();
                    parts.push(`${ivar_name}=${inspect_str}`)
                }
            }

            return String.new(`#<${parts.join(" ")}>`)
        });

        klass.alias_method("to_s", "inspect");

        klass.define_native_method("dup", (self: RValue): RValue => {
            const copy = new RValue(self.klass);

            for (const [key, value] of self.ivars) {
                copy.iv_set(key, value);
            }

            return copy;
        });

        // default impl that just returns the object
        klass.define_native_method("initialize_copy", (self: RValue, args: RValue[]): RValue => {
            const copy = args[0];
            if (self === copy) return copy;

            if (copy.klass != self.klass) {
                throw new TypeError("initialize_copy should take same class object")
            }

            return copy;
        });

        klass.define_native_method("freeze", (self: RValue): RValue => {
            self.freeze();
            return self;
        });

        klass.define_native_method("frozen?", (self: RValue): RValue => {
            return self.is_frozen() ? Qtrue : Qfalse;
        });
    });
};
