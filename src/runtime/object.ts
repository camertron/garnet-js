import { CallDataFlag, MethodCallData } from "../call_data";
import { FrozenError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Callable, Class, KernelModule, ObjectClass, RValue, Runtime, Qtrue, Qfalse, Module, Kwargs } from "../runtime";
import { Symbol } from "./symbol";
import { String } from "../runtime/string";

export class Object {
    static send(receiver: RValue, call_data_: MethodCallData | string, args: RValue[] = [], kwargs?: Kwargs, block?: RValue): RValue {
        let method_name: string;
        let call_data: MethodCallData | undefined;

        if (call_data_ instanceof MethodCallData) {
            method_name = call_data_.mid;
            call_data = call_data_;
        } else {
            method_name = call_data_;
            call_data = undefined;
        }

        const method = Object.find_method_under(receiver, method_name);

        if (block?.klass === Symbol.klass) {
            block = Symbol.to_proc(block);
        }

        if (method) {
            return method.call(
                ExecutionContext.current,
                receiver,
                args,
                kwargs,
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

            return Object.send(receiver, method_missing_call_data, [String.new(method_name), ...args], kwargs, block);
        }
    }

    static respond_to(obj: RValue, method_name: string): boolean {
        return this.find_method_under(obj, method_name) ? true : false;
    }

    // While find_method_under below can be passed any object, this method expects you to pass it a
    // Module (or a Class, since classes inherit from Module).
    static find_instance_method_under(mod: RValue, method_name: string, include_self: boolean = true, inherit: boolean = true): Callable | null {
        return this.find_method_under_helper(mod, method_name, include_self, inherit);
    }

    static find_method_under(obj: RValue, method_name: string, include_self: boolean = true, inherit: boolean = true): Callable | null {
        /* We check to see if the receiver has a singleton class in order to skip creating an
         * unnecessary one. Modules and classes always have a singleton class, but instances don't
         * unless one has been explicitly defined, i.e. to house some instance-specific behavior.
         * In the case of an instance, it is always safe to look for the desired method under
         * the class (if no singleton class exists) because singleton classes on instances inherit
         * from the instance's class:
         *
         * class Foo
         * end
         *
         * f = Foo.new
         * f.singleton_class.superclass  # => Foo
         *
         * Method resolution will search Foo immediately after Foo's singleton class. If the
         * singleton class has no behavior of its own, there is no need to create it or search
         * it for the desired method.
         */
        if (obj.has_singleton_class()) {
            return this.find_method_under_helper(obj.get_singleton_class(), method_name, include_self, inherit);
        } else {
            return this.find_method_under_helper(obj.klass, method_name, include_self, inherit);
        }
    }

    private static find_method_under_helper(mod: RValue, method_name: string, include_self: boolean = true, inherit: boolean = true): Callable | null {
        let found_method = null;

        Runtime.each_unique_ancestor(mod, include_self, (ancestor: RValue): boolean => {
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

            if (!inherit) return false;

            return true;
        });

        return found_method;
    }

    static find_super_method_under(self: RValue, method_owner: RValue, method_name: string): Callable | null {
        if (self.has_singleton_class()) {
            return this.find_super_method_under_helper(self.get_singleton_class(), method_owner, method_name);
        } else {
            return this.find_super_method_under_helper(self.klass, method_owner, method_name);
        }
    }

    static find_super_method_under_helper(self: RValue, method_owner: RValue, method_name: string) {
        let found_method_owner = false;
        let found_method: Callable | null = null;

        /* Iterate through all the ancestors of self until we reach the current method's owner.
         * Once the owner has been found in the inheritance hierarchy, we traverse from that point
         * up the hierarchy looking for the method in subsequent ancestors. It's not enough to
         * examine only the ancestors of self, because self cannot tell us what level of the
         * hierarchy we are already at; it is also not enough to look only at the ancestors of
         * the owner, since the owner may have a different set of ancestors than self. Instead, we
         * have to search self's ancestry until we find owner, then start looking for the appropriate
         * method from there.
         */
        Runtime.each_unique_ancestor(self, true, (ancestor: RValue): boolean => {
            if (ancestor === method_owner) {
                found_method_owner = true;
                return true;
            }

            if (found_method_owner) {
                const method = ancestor.get_data<Module>().methods[method_name];

                if (method) {
                    found_method = method;
                    return false;
                }
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
            const inspect_str = Object.send(obj, "inspect").get_data<string>();
            throw new FrozenError(`can't modify frozen ${obj.klass.get_data<Class>().name}: ${inspect_str}`);
        }
    }

    static find_constant(name: string): RValue | null {
        return this.find_constant_under(ObjectClass, name);
    }

    static find_constant_under(mod: RValue, name: string): RValue | null {
        return mod.get_data<Module>().find_constant(name);
    }

    static new() {
        return new RValue(ObjectClass);
    }
}

export const init = () => {
    (ObjectClass.get_data<Class>()).tap( (klass: Class) => {
        klass.include(KernelModule);

        // NOTE: send should actually be defined by the Kernel module
        klass.define_native_singleton_method("send", (self: RValue, args: RValue[]): RValue => {
            const method_name = args[0];
            Runtime.assert_type(method_name, String.klass);
            return Object.send(self.klass.get_data<Class>().get_singleton_class(), method_name.get_data<string>(), args);
        });

        klass.define_native_method("send", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData) => {
            const method_name = args[0];

            if (method_name.klass === String.klass || method_name.klass === Symbol.klass) {
                if (call_data) {
                    const new_call_data = MethodCallData.create(method_name.get_data<string>(), call_data.argc - 1, call_data.flag, call_data.kw_arg);
                    return Object.send(self, new_call_data, args.slice(1), kwargs, block);
                } else {
                    return Object.send(self, method_name.get_data<string>(), args.slice(1), kwargs, block);
                }
            } else {
                throw new TypeError(`${Object.send(method_name, "inspect").get_data<string>()} is not a symbol nor a string`);
            }
        });

        klass.define_native_method("inspect", (self: RValue): RValue => {
            const name = self.klass.get_data<Class>().full_name;
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
