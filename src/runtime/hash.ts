import { ArgumentError, KeyError, NameError } from "../errors";
import { BreakError, ExecutionContext } from "../execution_context";
import { RValue, Class, Qtrue, Qfalse, Qnil, Runtime, ObjectClass } from "../runtime";
import { Object } from "./object";
import { Proc } from "./proc";
import { String } from "../runtime/string";
import { Symbol } from "../runtime/symbol";
import { Integer } from "./integer";
import { hash_combine } from "../util/hash_utils";
import { RubyArray } from "../runtime/array";
import { hash_string } from "../util/string_utils";

export class Hash {
    static new(default_value?: RValue, default_proc?: RValue): RValue {
        const val = new RValue(this.klass, new Hash(default_value, default_proc));
        val.get_data<Hash>().self = val;
        return val;
    }

    static from_hash(hash: Hash) {
        const val = new RValue(this.klass, hash);
        val.get_data<Hash>().self = val;
        return val;
    }

    private static klass_: RValue;

    static get klass(): RValue {
        const klass = Object.find_constant("Hash");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Hash`);
        }

        return this.klass_;
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

    get_by_symbol(key: string): RValue {
        const hash_code = hash_string(key);

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

    set_by_symbol(key: string, value: RValue) {
        const hash_code = hash_string(key);
        this.keys.set(hash_code, Runtime.intern(key));
        this.values.set(hash_code, value);
    }

    delete(key: RValue): RValue | undefined {
        const hash_code = this.get_hash_code(key);
        this.keys.delete(hash_code);
        const value = this.values.get(hash_code);
        this.values.delete(hash_code);
        return value;
    }

    delete_by_symbol(key: string) {
        const hash_code = hash_string(key);
        this.keys.delete(hash_code);
        this.values.delete(hash_code);
    }

    has(key: RValue): boolean {
        const hash_code = this.get_hash_code(key);

        return this.keys.has(hash_code);
    }

    has_symbol(key: string): boolean {
        const key_entry = this.keys.get(hash_string(key));
        return key_entry !== undefined && key_entry.klass === Symbol.klass;
    }

    // only call this if you know all the strings are keys, i.e. if this is
    // a kwargs hash
    string_keys(): string[] {
        return Array.from(this.keys.values()).map(k => k.get_data<string>());
    }

    replace(other: Hash) {
        this.default_value = other.default_value;
        this.default_proc = other.default_proc;
        this.compare_by_identity = other.compare_by_identity;
        this.keys = new Map(other.keys);
        this.values = new Map(other.values);
    }

    each(cb: (k: RValue, v: RValue) => void) {
        for (const key of this.keys.keys()) {
            const k = this.keys.get(key)!;
            const v = this.values.get(key)!;
            cb(k, v);
        }
    }

    get length(): number {
        return this.keys.size;
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

    Runtime.define_class("Hash", ObjectClass, (klass: Class) => {
        klass.include(Object.find_constant("Enumerable")!);

        klass.define_native_singleton_method("new", (_self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
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
            if (args[0].klass !== Proc.klass) {
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
            return hash.has(key) ? Qtrue : Qfalse;
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

        klass.define_native_method("compare_by_identity", (self: RValue): RValue => {
            self.get_data<Hash>().compare_by_identity = true;
            return self;
        });

        klass.define_native_method("compare_by_identity?", (self: RValue): RValue => {
            return self.get_data<Hash>().compare_by_identity ? Qtrue : Qfalse;
        });

        klass.define_native_method("each", (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const key of hash.keys.values()) {
                    proc.call(ExecutionContext.current, [RubyArray.new([key, hash.get(key)])]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        klass.define_native_method("each_key", (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const key of hash.keys.values()) {
                    proc.call(ExecutionContext.current, [key]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        klass.define_native_method("each_value", (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const value of hash.values.values()) {
                    proc.call(ExecutionContext.current, [value]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        klass.define_native_method("transform_keys", (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): RValue => {
            let replacement_hash: Hash | null = null;

            if (args.length > 0) {
                Runtime.assert_type(args[0], Hash.klass);
                replacement_hash = args[0].get_data<Hash>();
            } else if (kwargs) {
                replacement_hash = kwargs;
            }

            const hash = self.get_data<Hash>();
            const result_hash = new Hash();
            const proc = block?.get_data<Proc>();

            try {
                hash.each((k: RValue, v: RValue) => {
                    let replacement_k = undefined;

                    if (replacement_hash) {
                        replacement_k = replacement_hash.get(k);
                    }

                    if (!replacement_k && proc) {
                        replacement_k = proc.call(ExecutionContext.current, [k]);
                    }

                    if (!replacement_k) {
                        replacement_k = k;
                    }

                    result_hash.set(replacement_k, v);
                });
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            return Hash.from_hash(result_hash);
        });

        klass.define_native_method("dup", (self: RValue): RValue => {
            const copy = new Hash();
            copy.replace(self.get_data<Hash>());
            return new RValue(Hash.klass, copy);
        });

        klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], Hash.klass);
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

        klass.define_native_method("fetch", (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
            const hash = self.get_data<Hash>();
            const key = args[0];
            const value = hash.get(key);
            if (value) return value;

            if (block) {
                return block.get_data<Proc>().call(ExecutionContext.current, [key]);
            } else if (args.length > 1) {
                return args[1];
            } else {
                throw new KeyError(`key not found: ${Object.send(key, "inspect").get_data<string>()}`);
            }
        });

        klass.define_native_method("delete", (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
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

        klass.define_native_method("size", (self: RValue, _args: RValue[]): RValue => {
            return Integer.get(self.get_data<Hash>().keys.size);
        });

        klass.alias_method("length", "size");

        klass.define_native_method("empty?", (self: RValue, _args: RValue[]): RValue => {
            return self.get_data<Hash>().keys.size === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("hash", (self: RValue, _args: RValue[]): RValue => {
            const data = self.get_data<Hash>();
            let hash = data.keys.size;

            data.each((k: RValue, v: RValue) => {
                const k_hash = Object.send(k, "hash").get_data<number>();
                const v_hash = Object.send(v, "hash").get_data<number>();
                hash = hash_combine(hash_combine(hash, k_hash), v_hash);
            });

            return Integer.get(hash);
        });

        klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
            const hash = self.get_data<Hash>();
            const other_hash_rval = args[0];

            if (other_hash_rval.klass !== Hash.klass) {
                return Qfalse;
            }

            const other_hash = other_hash_rval.get_data<Hash>();
            const seen_keys = new Set<number>();

            for (const [k_hash, _] of hash.keys) {
                seen_keys.add(k_hash);

                if (!other_hash.keys.has(k_hash)) {
                    return Qfalse;
                }

                const value = hash.values.get(k_hash)!;
                const other_value = other_hash.values.get(k_hash)!;

                if (!Object.send(value, "==", [other_value]).is_truthy()) {
                    return Qfalse;
                }
            }

            for (const [k_hash, _] of other_hash.keys) {
                // already compared the values for this key
                if (seen_keys.has(k_hash)) continue;

                if (!hash.keys.has(k_hash)) {
                    return Qfalse;
                }

                const value = hash.values.get(k_hash)!;
                const other_value = other_hash.values.get(k_hash)!;

                if (!Object.send(value, "==", [other_value]).is_truthy()) {
                    return Qfalse;
                }
            }

            return Qtrue;
        });

        klass.define_native_singleton_method("[]", (_self: RValue, args: RValue[], kwargs?: Hash): RValue => {
            let hash = new Hash();

            if (args.length === 1 && args[0].klass === Hash.klass) {
                args[0].get_data<Hash>().each((k: RValue, v: RValue): void => {
                    hash.set(k, v);
                });
            } else if (args.length === 1 && args[0].klass === RubyArray.klass) {
                const elements = args[0].get_data<RubyArray>().elements;

                for (let i = 0; i < elements.length; i ++) {
                    const arg = elements[i];

                    if (arg.klass === RubyArray.klass) {
                        const tuple_elements = arg.get_data<RubyArray>().elements;

                        if (tuple_elements.length === 1 || tuple_elements.length === 2) {
                            hash.set(tuple_elements[0], tuple_elements[1] || Qnil);
                        } else {
                            throw new ArgumentError(`invalid number of elements (${tuple_elements.length} for 1..2)`);
                        }
                    } else {
                        throw new ArgumentError(`wrong element type ${arg.klass.get_data<Class>().name} at ${i} (expected array)`)
                    }
                }
            } else if (args.length === 1 && kwargs) {
                hash.set(args[0], Hash.from_hash(kwargs));
            } else if (args.length === 0 && kwargs) {
                hash = kwargs;
            } else {
                if (args.length % 2 != 0) {
                    throw new ArgumentError("odd number of arguments for Hash");
                }

                for (let i = 0; i < args.length; i += 2) {
                    hash.set(args[i], args[i + 1]);
                }
            }

            return Hash.from_hash(hash);
        });
    });

    inited = true;
};
