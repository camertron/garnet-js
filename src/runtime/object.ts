import { CallDataFlag, MethodCallData } from "../call_data";
import { NoMethodError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Callable, Class, ClassClass, KernelModule, ModuleClass, ObjectClass, RValue, Runtime, StringClass, String, SymbolClass } from "../runtime";

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

        if (!receiver?.methods) {
            debugger;
        }

        if (receiver.methods[method_name]) {
            method = receiver.methods[method_name];
        } else if (receiver.klass == ClassClass || receiver.klass == ModuleClass) {
            method = Object.find_method_under(receiver.get_data<Class>().get_singleton_class(), method_name);
        } else {
            method = Object.find_method_under(receiver.klass, method_name);
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
    });
};
