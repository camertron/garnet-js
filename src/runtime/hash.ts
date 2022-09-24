import { String, Runtime, RValue, Object, ObjectClass, Class, Qnil, Qtrue, Qfalse } from "../runtime";

export class Hash {
    static new(): RValue {
        return new RValue(HashClass.get_data<Class>(), new Hash());
    }

    // maps hash codes to key objects
    public keys: Map<number, RValue>;

    // maps hash codes to value objects
    public values: Map<number, RValue>;

    constructor() {
        this.keys = new Map();
        this.values = new Map();
    }

    get(key: RValue): RValue {
        const hash_code = this.get_hash_code(key);

        if (this.keys.has(hash_code)) {
            return this.values.get(hash_code)!;
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
        return Object.send(obj, "hash").get_data<number>();
    }
}

export const HashClass = Runtime.define_class("Hash", ObjectClass, (klass: Class) => {
    klass.define_native_method("[]", (self: RValue, key: RValue): RValue => {
        const hash = self.get_data<Hash>();
        return hash.get(key);
    });

    klass.define_native_method("[]=", (self: RValue, key: RValue, value: RValue): RValue => {
        const hash = self.get_data<Hash>();
        return hash.set(key, value);
    });

    klass.define_native_method("include?", (self: RValue, key: RValue): RValue => {
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
});
