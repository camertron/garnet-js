import { is_node } from "../env";
import { Class, ObjectClass, Qnil, RValue, Runtime } from "../runtime"
import { Hash } from "./hash";
import { RubyString } from "../runtime/string";

let inited = false;

export const init = () => {
    if (inited) return;

    const env_hash = new Hash();
    const env = new RValue(ObjectClass);

    env.get_singleton_class().get_data<Class>().define_native_method("[]", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], await RubyString.klass());

        const result = await env_hash.get(args[0]);

        if (is_node && result === Qnil) {
            const result_from_env = process.env[args[0].get_data<string>()];

            if (result_from_env) {
                return RubyString.new(result_from_env);
            }

            return Qnil;
        }

        return result;
    });

    env.get_singleton_class().get_data<Class>().define_native_method("[]=", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], await RubyString.klass());
        await Runtime.assert_type(args[1], await RubyString.klass());
        await env_hash.set(args[0], args[1]);
        return args[1];
    });

    ObjectClass.get_data<Class>().constants["ENV"] = env

    inited = true;
};
