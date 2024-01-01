import { isNode } from "../env";
import { NativeCallable, ObjectClass, Qnil, RValue, Runtime, String, StringClass } from "../runtime"
import { Hash } from "./hash";

let inited = false;

export const init = () => {
    if (inited) return;

    const env_hash = new Hash();
    const env = new RValue(ObjectClass);

    env.methods["[]"] = new NativeCallable((self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);

        const result = env_hash.get(args[0]);

        if (isNode && result === Qnil) {
            const result_from_env = process.env[args[0].get_data<string>()];

            if (result_from_env) {
                return String.new(result_from_env);
            }

            return Qnil;
        }

        return result;
    });

    env.methods["[]="] = new NativeCallable((self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], StringClass);
        Runtime.assert_type(args[1], StringClass);
        env_hash.set(args[0], args[1]);
        return args[1];
    });

    Runtime.constants["ENV"] = env

    inited = true;
};
