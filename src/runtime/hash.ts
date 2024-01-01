import { ExecutionContext } from "../execution_context";
import { String, RValue, Class, Qtrue, Qfalse, Qnil, HashClass, ProcClass, Array } from "../runtime";
import { Object } from "./object";
import { Proc } from "./proc";

export class Hash {
    static new(default_value?: RValue, default_proc?: RValue): RValue {
        return new RValue(HashClass, new Hash(default_value, default_proc));
    }

    // maps hash codes to key objects
    public keys: Map<number, RValue>;

    // maps hash codes to value objects
    public values: Map<number, RValue>;

    public compare_by_identity: boolean = false;

    public default_value?: RValue;
    public default_proc?: RValue;

    constructor(default_value?: RValue, default_proc?: RValue) {
        this.keys = new Map();
        this.values = new Map();
        this.default_value = default_value;
        this.default_proc = default_proc;
    }

    get(key: RValue): RValue {
        const hash_code = this.get_hash_code(key);

        if (this.keys.has(hash_code)) {
            return this.values.get(hash_code)!;
        } else {
            if (this.default_value) {
                return this.default_value;
            } else if (this.default_proc) {
                return this.default_proc.get_data<Proc>().call(ExecutionContext.current, [key]);
            }
        }

        return Qnil;
    }

    set(key: RValue, value: RValue): RValue {
        const hash_code = this.get_hash_code(key);
        this.keys.set(hash_code, key);
        this.values.set(hash_code, value);
        return value;
    }

    has(key: RValue): RValue {
        const hash_code = this.get_hash_code(key);

        if (this.keys.has(hash_code)) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    }

    private get_hash_code(obj: RValue): number {
        if (this.compare_by_identity) {
            return obj.object_id;
        } else {
            return Object.send(obj, "hash").get_data<number>();
        }
    }
}

export const defineHashBehaviorOn = (klass: Class) => {
    klass.define_native_singleton_method("new", (_self: RValue, args: RValue[], block?: RValue): RValue => {
        return Hash.new(args[0] || Qnil, block);
    });

    klass.define_native_method("default", (self: RValue): RValue => {
        return self.get_data<Hash>().default_value || Qnil;
    });

    klass.define_native_method("default=", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Hash>().default_value = args[0];
        return args[0];
    });

    klass.define_native_method("default_proc", (self: RValue): RValue => {
        return self.get_data<Hash>().default_proc || Qnil;
    });

    klass.define_native_method("default_proc=", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass !== ProcClass) {
            throw new TypeError(`wrong default_proc type ${args[0].klass.get_data<Class>().name} (expected Proc)`)
        }

        self.get_data<Hash>().default_value = args[0];
        return args[0];
    });

    klass.define_native_method("[]", (self: RValue, args: RValue[]): RValue => {
        const key = args[0];
        const hash = self.get_data<Hash>();
        return hash.get(key);
    });

    klass.define_native_method("[]=", (self: RValue, args: RValue[]): RValue => {
        const [key, value] = args;
        const hash = self.get_data<Hash>();
        return hash.set(key, value);
    });

    klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
        const key = args[0];
        const hash = self.get_data<Hash>();
        return hash.has(key);
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const hash = self.get_data<Hash>();
        const pairs: string[] = [];

        for (const entry of hash.keys) {
            const [hash_code, key] = entry;
            const value = hash.values.get(hash_code)!;
            const key_str = Object.send(key, "inspect").get_data<string>();
            const value_str = Object.send(value, "inspect").get_data<string>();
            pairs.push(`${key_str}=>${value_str}`);
        }

        return String.new(`{${pairs.join(", ")}}`);
    });

    klass.define_native_method("compare_by_identity", (self: RValue, args: RValue[]): RValue => {
        self.get_data<Hash>().compare_by_identity = true;
        return self;
    });

    klass.define_native_method("compare_by_identity?", (self: RValue, args: RValue[]): RValue => {
        return self.get_data<Hash>().compare_by_identity ? Qtrue : Qfalse;
    });

    klass.define_native_method("each", (self: RValue, _args: RValue[], block?: RValue): RValue => {
        const hash = self.get_data<Hash>();

        if (block) {
            for (const key of hash.keys.values()) {
                block.get_data<Proc>().call(ExecutionContext.current, [key, hash.get(key)]);
            }

            return self;
        } else {
            // @TODO: return an Enumerator
            return Qnil;
        }
    });
};
