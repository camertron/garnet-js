import { KeyError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { RValue, Class, Qtrue, Qfalse, Qnil, HashClass, ProcClass, Runtime, Array as RubyArray } from "../runtime";
import { Object } from "./object";
import { Proc } from "./proc";
import { String } from "../runtime/string";

export class Hash {
    static new(default_value?: RValue, default_proc?: RValue): RValue {
        const val = new RValue(HashClass, new Hash(default_value, default_proc));
        val.get_data<Hash>().self = val;
        return val;
    }

    // maps hash codes to key objects
    public keys: Map<number, RValue>;

    // maps hash codes to value objects
    public values: Map<number, RValue>;

    public compare_by_identity: boolean = false;

    public default_value?: RValue;
    public default_proc?: RValue;

    public self: RValue;

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
                return this.default_proc.get_data<Proc>().call(ExecutionContext.current, [this.self, key]);
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

    delete(key: RValue): RValue | undefined {
        const hash_code = this.get_hash_code(key);
        this.keys.delete(hash_code);
        const value = this.values.get(hash_code);
        this.values.delete(hash_code);
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

    replace(other: Hash) {
        this.default_value = other.default_value;
        this.default_proc = other.default_proc;
        this.compare_by_identity = other.compare_by_identity;
        this.keys = new Map(other.keys);
        this.values = new Map(other.values);
    }

    private get_hash_code(obj: RValue): number {
        if (this.compare_by_identity) {
            return obj.object_id;
        } else {
            return Object.send(obj, "hash").get_data<number>();
        }
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    const klass = Runtime.constants["Hash"].get_data<Class>();

    klass.define_native_singleton_method("new", (_self: RValue, args: RValue[], block?: RValue): RValue => {
        return Hash.new(args[0], block);
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

    klass.alias_method("key?", "include?");

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

    klass.define_native_method("dup", (self: RValue): RValue => {
        const copy = new Hash();
        copy.replace(self.get_data<Hash>());
        return new RValue(HashClass, copy);
    });

    klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], HashClass);
        const other = args[0].get_data<Hash>();
        self.get_data<Hash>().replace(other);
        return self;
    });

    klass.alias_method("initialize_copy", "replace");

    klass.define_native_method("keys", (self: RValue): RValue => {
        const keys = Array.from(self.get_data<Hash>().keys.values());
        return RubyArray.new(keys);
    });

    klass.define_native_method("values", (self: RValue): RValue => {
        const keys = Array.from(self.get_data<Hash>().values.values());
        return RubyArray.new(keys);
    });

    klass.define_native_method("fetch", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const hash = self.get_data<Hash>();
        const key = args[0];
        const value = hash.get(key);
        if (value) return value;

        if (block) {
            return block.get_data<Proc>().call(ExecutionContext.current, [key]);
        } else if (args.length > 1) {
            return args[1];
        } else {
            throw new KeyError(`key not found: ${Object.send(key, "inspect")}`);
        }
    });

    klass.define_native_method("delete", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const hash = self.get_data<Hash>();
        const key = args[0];
        const value = hash.delete(key);
        if (value) return value;

        if (block) {
            return block.get_data<Proc>().call(ExecutionContext.current, [key]);
        } else {
            return Qnil;
        }
    });

    inited = true;
};
