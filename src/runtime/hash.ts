import { ArgumentError, KeyError, NameError, TypeError } from "../errors";
import { BreakError, ExecutionContext } from "../execution_context";
import { RValue, Class, Qtrue, Qfalse, Qnil, Runtime, ObjectClass } from "../runtime";
import { Object } from "./object";
import { Proc } from "./proc";
import { RubyString } from "../runtime/string";
import { Symbol } from "../runtime/symbol";
import { Integer } from "./integer";
import { hash_combine } from "../util/hash_utils";
import { RubyArray } from "../runtime/array";
import { hash_string } from "../util/string_utils";
import { BlockCallData, CallDataFlag, MethodCallData } from "../call_data";
import { Kernel } from "./kernel";

export class Hash {
    static async new(default_value?: RValue, default_proc?: RValue): Promise<RValue> {
        return this.subclass_new(await this.klass(), default_value, default_proc);
    }

    static subclass_new(klass: RValue, default_value?: RValue, default_proc?: RValue): RValue {
        const val = new RValue(klass, new Hash(default_value, default_proc));
        val.get_data<Hash>().self = val;
        return val;
    }

    static async from_hash(hash: Hash) {
        const val = new RValue(await this.klass(), hash);
        val.get_data<Hash>().self = val;
        return val;
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Hash");

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

    public ruby2_keywords_hash: boolean = false;

    constructor(default_value?: RValue, default_proc?: RValue) {
        this.keys = new Map();
        this.values = new Map();
        this.default_value = default_value;
        this.default_proc = default_proc;
    }

    async get(key: RValue): Promise<RValue> {
        const hash_code = await this.get_hash_code(key);

        if (this.keys.has(hash_code)) {
            return this.values.get(hash_code)!;
        } else {
            if (this.default_value) {
                return this.default_value;
            } else if (this.default_proc) {
                return await this.default_proc.get_data<Proc>().call(ExecutionContext.current, [this.self, key]);
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

    async set(key: RValue, value: RValue): Promise<RValue> {
        const hash_code = await this.get_hash_code(key);
        this.keys.set(hash_code, key);
        this.values.set(hash_code, value);
        return value;
    }

    async set_by_symbol(key: string, value: RValue) {
        const hash_code = hash_string(key);
        this.keys.set(hash_code, await Runtime.intern(key));
        this.values.set(hash_code, value);
    }

    async delete(key: RValue): Promise<RValue | undefined> {
        const hash_code = await this.get_hash_code(key);
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

    async has(key: RValue): Promise<boolean> {
        const hash_code = await this.get_hash_code(key);

        return this.keys.has(hash_code);
    }

    async has_symbol(key: string): Promise<boolean> {
        const key_entry = this.keys.get(hash_string(key));
        return key_entry !== undefined && key_entry.klass === await Symbol.klass();
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

    async each(cb: (k: RValue, v: RValue) => Promise<void>) {
        for (const key of this.keys.keys()) {
            const k = this.keys.get(key)!;
            const v = this.values.get(key)!;
            await cb(k, v);
        }
    }

    get length(): number {
        return this.keys.size;
    }

    private async get_hash_code(obj: RValue): Promise<number> {
        if (this.compare_by_identity) {
            return obj.object_id;
        } else {
            return (await Object.send(obj, "hash")).get_data<number>();
        }
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Hash", ObjectClass, async (klass: Class) => {
        klass.include((await Object.find_constant("Enumerable"))!);

        klass.define_native_singleton_method("new", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            return await Hash.subclass_new(self, args[0], block);
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

        klass.define_native_method("default_proc=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass !== await Proc.klass()) {
                throw new TypeError(`wrong default_proc type ${args[0].klass.get_data<Class>().name} (expected Proc)`)
            }

            self.get_data<Hash>().default_value = args[0];
            return args[0];
        });

        klass.define_native_method("[]", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const key = args[0];
            const hash = self.get_data<Hash>();
            return await hash.get(key);
        });

        klass.define_native_method("[]=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [key, value] = args;
            const hash = self.get_data<Hash>();
            return await hash.set(key, value);
        });

        klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const key = args[0];
            const hash = self.get_data<Hash>();
            return await hash.has(key) ? Qtrue : Qfalse;
        });

        await klass.alias_method("key?", "include?");
        await klass.alias_method("has_key?", "include?");

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();
            const pairs: string[] = [];

            for (const entry of hash.keys) {
                const [hash_code, key] = entry;
                const value = hash.values.get(hash_code)!;
                const key_str = (await Object.send(key, "inspect")).get_data<string>();
                const value_str = (await Object.send(value, "inspect")).get_data<string>();
                pairs.push(`${key_str}=>${value_str}`);
            }

            return RubyString.new(`{${pairs.join(", ")}}`);
        });

        klass.define_native_method("compare_by_identity", (self: RValue): RValue => {
            self.get_data<Hash>().compare_by_identity = true;
            return self;
        });

        klass.define_native_method("compare_by_identity?", (self: RValue): RValue => {
            return self.get_data<Hash>().compare_by_identity ? Qtrue : Qfalse;
        });

        klass.define_native_method("each", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const key of hash.keys.values()) {
                    await proc.call(ExecutionContext.current, [await RubyArray.new([key, await hash.get(key)])]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        klass.define_native_method("each_key", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const key of hash.keys.values()) {
                    await proc.call(ExecutionContext.current, [key]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        klass.define_native_method("each_value", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();

            if (block) {
                const proc = block.get_data<Proc>();

                for (const value of hash.values.values()) {
                    await proc.call(ExecutionContext.current, [value]);
                }

                return self;
            } else {
                // @TODO: return an Enumerator
                return Qnil;
            }
        });

        const get_replacement_key = async (k: RValue, replacement_hash?: Hash, replacement_block?: Proc): Promise<RValue> => {
            let replacement_k = undefined;

            if (replacement_hash) {
                replacement_k = await replacement_hash.get(k);
            }

            if (!replacement_k && replacement_block) {
                replacement_k = await replacement_block.call(ExecutionContext.current, [k]);
            }

            if (!replacement_k?.is_truthy()) {
                replacement_k = k;
            }

            return replacement_k;
        }

        klass.define_native_method("transform_keys", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            let replacement_hash: Hash | undefined = undefined;

            if (args.length > 0) {
                await Runtime.assert_type(args[0], await Hash.klass());
                replacement_hash = args[0].get_data<Hash>();
            } else if (kwargs) {
                replacement_hash = kwargs;
            }

            const hash = self.get_data<Hash>();
            const result_hash = new Hash();
            const proc = block?.get_data<Proc>();

            try {
                const keys = Array.from(hash.keys.values());

                for (const k of keys) {
                    const replacement_k = await get_replacement_key(k, replacement_hash, proc);
                    const v = await hash.get(k)!;
                    await result_hash.set(replacement_k, v);
                }
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            return Hash.from_hash(result_hash);
        });

        klass.define_native_method("transform_keys!", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            let replacement_hash: Hash | undefined = undefined;

            if (args.length > 0) {
                await Runtime.assert_type(args[0], await Hash.klass());
                replacement_hash = args[0].get_data<Hash>();
            } else if (kwargs) {
                replacement_hash = kwargs;
            }

            const hash = self.get_data<Hash>();
            const proc = block?.get_data<Proc>();

            try {
                const keys = Array.from(hash.keys.values());

                for (const k of keys) {
                    const replacement_k = await get_replacement_key(k, replacement_hash, proc);
                    const v = (await hash.delete(k))!;
                    await hash.set(replacement_k, v);
                }
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }

            return self;
        });

        klass.define_native_method("transform_values", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (block) {
                const hash = self.get_data<Hash>();
                const proc = block.get_data<Proc>();
                const result_hash = new Hash();

                await hash.each(async (k: RValue, v: RValue) => {
                    let new_value;

                    try {
                        new_value = await proc.call(ExecutionContext.current, [v]);
                    } catch (e) {
                        if (e instanceof BreakError) {
                            new_value = e.value;
                        } else {
                            throw e;
                        }
                    }

                    await result_hash.set(k, new_value);
                });

                return await Hash.from_hash(result_hash);
            } else {
                // @TODO: return an enumerator
                return Qnil;
            }
        });

        klass.define_native_method("transform_values!", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (block) {
                const hash = self.get_data<Hash>();
                const proc = block.get_data<Proc>();

                await hash.each(async (k: RValue, v: RValue) => {
                    let new_value;

                    try {
                        new_value = await proc.call(ExecutionContext.current, [v]);
                    } catch (e) {
                        if (e instanceof BreakError) {
                            new_value = e.value;
                        } else {
                            throw e;
                        }
                    }

                    await hash.set(k, new_value);
                });

                return self;
            } else {
                // @TODO: return an enumerator
                return Qnil;
            }
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            const copy = new Hash();
            copy.replace(self.get_data<Hash>());
            return new RValue(await Hash.klass(), copy);
        });

        klass.define_native_method("replace", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await Hash.klass());
            const other = args[0].get_data<Hash>();
            self.get_data<Hash>().replace(other);
            return self;
        });

        await klass.alias_method("initialize_copy", "replace");

        klass.define_native_method("keys", async (self: RValue): Promise<RValue> => {
            const keys = Array.from(self.get_data<Hash>().keys.values());
            return await RubyArray.new(keys);
        });

        klass.define_native_method("values", async (self: RValue): Promise<RValue> => {
            const keys = Array.from(self.get_data<Hash>().values.values());
            return await RubyArray.new(keys);
        });

        klass.define_native_method("fetch", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();
            const key = args[0];

            // check if the key exists in the hash (don't use default value)
            if (await hash.has(key)) {
                return await hash.get(key);
            }

            if (block) {
                return await block.get_data<Proc>().call(ExecutionContext.current, [key]);
            } else if (args.length > 1) {
                return args[1];
            } else {
                throw new KeyError(`key not found: ${(await Object.send(key, "inspect")).get_data<string>()}`);
            }
        });

        klass.define_native_method("delete", async (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();
            const key = args[0];
            const value = await hash.delete(key);
            if (value) return value;

            if (block) {
                return await block.get_data<Proc>().call(ExecutionContext.current, [key]);
            } else {
                return Qnil;
            }
        });

        klass.define_native_method("delete_if", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (block) {
                const proc = block.get_data<Proc>();
                const hash = self.get_data<Hash>();

                // why is this necessary?
                const call_data = BlockCallData.create(1, CallDataFlag.ARGS_SIMPLE | CallDataFlag.ARGS_SPLAT);

                try {
                    await Object.send(self, "each", [], undefined, await Proc.from_native_fn(ExecutionContext.current, async (self: RValue, args: RValue[]): Promise<RValue> => {
                        if ((await proc.call(ExecutionContext.current, args, undefined, undefined, call_data)).is_truthy()) {
                            await hash.delete(args[0].get_data<RubyArray>().elements[0]);
                        }

                        return Qnil;
                    }));

                    return self;
                } catch(e) {
                    if (e instanceof BreakError) {
                        return e.value;
                    }

                    throw e;
                }
            } else {
                // @TODO: return an enumerator
                return Qnil;
            }
        });

        klass.define_native_method("size", async (self: RValue, _args: RValue[]): Promise<RValue> => {
            return await Integer.get(self.get_data<Hash>().keys.size);
        });

        await klass.alias_method("length", "size");

        klass.define_native_method("empty?", (self: RValue, _args: RValue[]): RValue => {
            return self.get_data<Hash>().keys.size === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("hash", async (self: RValue, _args: RValue[]): Promise<RValue> => {
            const data = self.get_data<Hash>();
            let hash = data.keys.size;

            await data.each(async (k: RValue, v: RValue) => {
                const k_hash = (await Object.send(k, "hash")).get_data<number>();
                const v_hash = (await Object.send(v, "hash")).get_data<number>();
                hash = hash_combine(hash_combine(hash, k_hash), v_hash);
            });

            return await Integer.get(hash);
        });

        klass.define_native_method("merge", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (args.length === 0 && !kwargs) {
                return self;
            }

            const data = self.get_data<Hash>();
            const proc = block ? block.get_data<Proc>() : null;
            const result = new Hash();

            await data.each(async (k: RValue, v: RValue) => {
                await result.set(k, v);
            });

            for (const arg of args) {
                await Runtime.assert_type(arg, await Hash.klass());
                const other = arg.get_data<Hash>();

                await other.each(async (k: RValue, v: RValue) => {
                    if (proc && await data.has(k)) {
                        try {
                            v = await proc.call(ExecutionContext.current, [k, await data.get(k), v]);
                        } catch (e) {
                            if (e instanceof BreakError) {
                                v = e.value;
                            } else {
                                throw e;
                            }
                        }
                    }

                    await result.set(k, v);
                });
            }

            if (kwargs) {
                await kwargs.each(async (k: RValue, v: RValue) => {
                    if (proc && await data.has(k)) {
                        try {
                            v = await proc.call(ExecutionContext.current, [k, await data.get(k), v]);
                        } catch (e) {
                            if (e instanceof BreakError) {
                                v = e.value;
                            } else {
                                throw e;
                            }
                        }
                    }

                    await result.set(k, v);
                });
            }

            return await Hash.from_hash(result);
        });

        klass.define_native_method("merge!", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (args.length === 0 && !kwargs) {
                return self;
            }

            const data = self.get_data<Hash>();
            const proc = block ? block.get_data<Proc>() : null;

            for (const arg of args) {
                await Runtime.assert_type(arg, await Hash.klass());
                const other = arg.get_data<Hash>();

                await other.each(async (k: RValue, v: RValue) => {
                    if (proc && await data.has(k)) {
                        try {
                            v = await proc.call(ExecutionContext.current, [k, await data.get(k), v]);
                        } catch (e) {
                            if (e instanceof BreakError) {
                                v = e.value;
                            } else {
                                throw e;
                            }
                        }
                    }

                    await data.set(k, v);
                });
            }

            if (kwargs) {
                await kwargs.each(async (k: RValue, v: RValue) => {
                    if (proc && await data.has(k)) {
                        try {
                            v = await proc.call(ExecutionContext.current, [k, await data.get(k), v]);
                        } catch (e) {
                            if (e instanceof BreakError) {
                                v = e.value;
                            } else {
                                throw e;
                            }
                        }
                    }

                    await data.set(k, v);
                });
            }

            return self;
        });

        await klass.alias_method("update", "merge!");

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const hash = self.get_data<Hash>();
            const other_hash_rval = args[0];

            if (!(await Kernel.is_a(other_hash_rval, await Hash.klass()))) {
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

                if (!(await Object.send(value, "==", [other_value])).is_truthy()) {
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

                if (!(await Object.send(value, "==", [other_value])).is_truthy()) {
                    return Qfalse;
                }
            }

            return Qtrue;
        });

        klass.define_native_singleton_method("[]", async (_self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
            let hash = new Hash();

            if (args.length === 1 && args[0].klass === await Hash.klass()) {
                await args[0].get_data<Hash>().each(async (k: RValue, v: RValue) => {
                    await hash.set(k, v);
                });
            } else if (args.length === 1 && args[0].klass === await RubyArray.klass()) {
                const elements = args[0].get_data<RubyArray>().elements;

                for (let i = 0; i < elements.length; i ++) {
                    const arg = elements[i];

                    if (arg.klass === await RubyArray.klass()) {
                        const tuple_elements = arg.get_data<RubyArray>().elements;

                        if (tuple_elements.length === 1 || tuple_elements.length === 2) {
                            await hash.set(tuple_elements[0], tuple_elements[1] || Qnil);
                        } else {
                            throw new ArgumentError(`invalid number of elements (${tuple_elements.length} for 1..2)`);
                        }
                    } else {
                        throw new ArgumentError(`wrong element type ${arg.klass.get_data<Class>().name} at ${i} (expected array)`)
                    }
                }
            } else if (args.length === 1 && kwargs) {
                await hash.set(args[0], await Hash.from_hash(kwargs));
            } else if (args.length === 0 && kwargs) {
                hash = kwargs;
            } else {
                if (args.length % 2 != 0) {
                    throw new ArgumentError("odd number of arguments for Hash");
                }

                for (let i = 0; i < args.length; i += 2) {
                    await hash.set(args[i], args[i + 1]);
                }
            }

            return Hash.from_hash(hash);
        });

        klass.define_native_method("invert", async (self: RValue): Promise<RValue> => {
            const hash = self.get_data<Hash>();
            const inverted = new Hash();

            await hash.each(async (k: RValue, v: RValue) => {
                await inverted.set(v, k);
            });

            return Hash.from_hash(inverted);
        });

        klass.define_native_singleton_method("ruby2_keywords_hash?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const hash_rval = args[0];

            if (hash_rval.klass !== await Hash.klass()) {
                throw new TypeError("no implicit conversion into Hash");
            }

            const hash = hash_rval.get_data<Hash>();
            return hash.ruby2_keywords_hash ? Qtrue : Qfalse;
        });

        klass.define_native_singleton_method("ruby2_keywords_hash", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const hash_rval = args[0];

            if (hash_rval.klass !== await Hash.klass()) {
                throw new TypeError("no implicit conversion into Hash");
            }

            const original_hash = hash_rval.get_data<Hash>();
            const new_hash = new Hash(original_hash.default_value, original_hash.default_proc);

            await original_hash.each(async (k: RValue, v: RValue) => {
                await new_hash.set(k, v);
            });

            const new_hash_rval = await Hash.from_hash(new_hash);

            // copy instance variables to match Ruby behavior
            if (hash_rval.ivars) {
                hash_rval.ivars.forEach((value, key) => {
                    new_hash_rval.iv_set(key, value);
                });
            }

            new_hash.ruby2_keywords_hash = true;

            return new_hash_rval;
        });
    });

    inited = true;
};
