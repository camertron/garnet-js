import { String, RValue, Object, Class, Hash, Qtrue, Qfalse } from "../runtime";

export const defineHashBehaviorOn = (klass: Class) => {
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
};
