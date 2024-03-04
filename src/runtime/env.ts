import { is_node } from "../env";
import { Class, ObjectClass, Qnil, RValue, Runtime, StringClass } from "../runtime"
import { Hash } from "./hash";
import { String } from "../runtime/string";

let inited = false;

export const init = () => {
    if (inited) return;

    const env_hash = new Hash();
    const env = new RValue(ObjectClass);

    env.get_singleton_class().get_data<Class>().define_native_method("[]", (_self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);

        const result = env_hash.get(args[0]);

        if (is_node && result === Qnil) {
            const result_from_env = process.env[args[0].get_data<string>()];

            if (result_from_env) {
                return String.new(result_from_env);
            }

            return Qnil;
        }

        return result;
    });

    env.get_singleton_class().get_data<Class>().define_native_method("[]=", (_self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        Runtime.assert_type(args[1], StringClass);
        env_hash.set(args[0], args[1]);
        return args[1];
    });

    ObjectClass.get_data<Class>().constants["ENV"] = env

    inited = true;
};
