import { is_node } from "../env";
import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime"
import { Hash } from "./hash";
import { RubyString } from "../runtime/string";

let inited = false;

export class Env {
    static get instance_rval(): RValue {
        return ObjectClass.get_data<Class>().constants["ENV"];
    }

    static get instance(): Env {
        return this.instance_rval.get_data<Env>();
    }

    private entries: Hash;

    constructor() {
        this.entries = new Hash();
    }

    async get(k: RValue): Promise<RValue> {
        return await this.entries.get(k);
    }

    async set(k: RValue, v: RValue) {
        await this.entries.set(k, v);
    }

    async has(k: RValue): Promise<boolean> {
        return await this.entries.has(k);
    }

    async delete(k: RValue): Promise<void> {
        await this.entries.delete(k);
    }
}

export const init = () => {
    if (inited) return;

    const env = new Env();
    const env_rval = new RValue(ObjectClass, env);

    env_rval.get_singleton_class().get_data<Class>().define_native_method("[]", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], await RubyString.klass());

        const result = await env.get(args[0]);

        if (is_node && result === Qnil) {
            const result_from_env = process.env[args[0].get_data<string>()];

            if (result_from_env) {
                return RubyString.new(result_from_env);
            }

            return Qnil;
        }

        return result;
    });

    env_rval.get_singleton_class().get_data<Class>().define_native_method("[]=", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], await RubyString.klass());
        await Runtime.assert_type(args[1], Qnil.klass, await RubyString.klass());

        if (args[1] === Qnil) {
            await env.delete(args[0]);
        } else {
            await env.set(args[0], args[1]);
        }

        return args[1];
    });

    env_rval.get_singleton_class().get_data<Class>().define_native_method("include?", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], await RubyString.klass());

        if (await env.has(args[0])) {
            return Qtrue;
        }

        if (is_node) {
            const key = args[0].get_data<string>();

            if (process.env[key] !== undefined) {
                return Qtrue;
            }
        }

        return Qfalse;
    });

    ObjectClass.get_data<Class>().constants["ENV"] = env_rval;

    inited = true;
};
