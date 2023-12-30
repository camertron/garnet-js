import { NoMethodError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Callable, Class, ClassClass, KernelModule, ModuleClass, ObjectClass, RValue, Runtime, StringClass, String, SymbolClass } from "../runtime";

export class Object {
    static send(self: RValue, method_name: string, args: RValue[] = [], block?: RValue): RValue {
        let method = null;

        if (!self?.methods) {
            debugger;
        }

        if (self.methods[method_name]) {
            method = self.methods[method_name];
        } else if (self.klass == ClassClass || self.klass == ModuleClass) {
            method = Object.find_method_under(self.get_data<Class>().get_singleton_class(), method_name);
        } else {
            method = Object.find_method_under(self.klass, method_name);
        }

        if (method) {
            return method.call(ExecutionContext.current, self, args, block);
        } else {
            const inspect_str = Object.send(self, "inspect").get_data<string>();
            throw new NoMethodError(`undefined method \`${method_name}' for ${inspect_str}`)
        }
    }

    static find_method_under(mod: RValue, method_name: string): Callable | null {
        let found_method = null;

        Runtime.each_unique_ancestor(mod, (ancestor: RValue): boolean => {
            const method = ancestor.get_data<Class>().methods[method_name];

            if (method) {
                found_method = method;
                return false; // exit early from each_unique_ancestor()
            }

            return true;
        });

        return found_method;
    }

    static object_id_to_str(object_id: number): string {
        const id_str = object_id.toString(16).padStart(16, "0");
        return `0x${id_str}`;
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

        klass.define_native_method("send", (self: RValue, args: RValue[]) => {
            const method_name = args[0];

            if (method_name.klass === StringClass || method_name.klass === SymbolClass) {
                return Object.send(self, method_name.get_data<string>(), args.slice(1));
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
    });
};
