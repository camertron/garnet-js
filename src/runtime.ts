import { InstructionSequence } from "./instruction_sequence";
import { Compiler, LexicalScope } from "./compiler";
import { LoadError, TypeError, NoMethodError, NotImplementedError, NameError } from "./errors";
import { ExecutionContext } from "./execution_context";
import { init as array_init } from "./runtime/array";
import { Integer, init as integer_init } from "./runtime/integer";
import { Object } from "./runtime/object";
import { init as symbol_init } from "./runtime/symbol";
import { init as string_init } from "./runtime/string";
import { Dir } from "./runtime/dir";
import { vmfs } from "./vmfs";
import { Proc, init as proc_init } from "./runtime/proc";
import { Hash as RubyHash, init as hash_init } from "./runtime/hash";
import { is_node } from "./env";
import { BlockCallData, CallData, CallDataFlag, MethodCallData } from "./call_data";
import { init as float_init } from "./runtime/float";
import { init as module_init } from "./runtime/module";
import { Kernel, init as kernel_init } from "./runtime/kernel";
import { init as object_init } from "./runtime/object";
import { init as error_init } from "./errors";
import { init as process_init } from "./runtime/process";
import { init as env_init } from "./runtime/env";
import { init as file_init } from "./runtime/file";
import { init as dir_init } from "./runtime/dir";
import { init as comparable_init } from "./runtime/comparable";
import { init as numeric_init } from "./runtime/numeric";
import { init as rb_config_init } from "./lib/rbconfig"
import { init as stringio_init } from "./lib/stringio"
import { init as socket_init } from "./lib/socket"
import { init as enumerable_init } from "./runtime/enumerable";
import { init as range_init } from "./runtime/range";
import { init as binding_init } from "./runtime/binding";
import { init as signal_init } from "./runtime/signal";
import { init as time_init } from "./lib/time";
import { init as date_init } from "./lib/date";
import { init as thread_init } from './lib/thread';
import { init as regexp_init} from "./runtime/regexp";
import { init as encoding_init } from "./runtime/encoding";
import { init as struct_init } from "./runtime/struct";
import { init as rational_init } from "./runtime/rational";
import { init as enumerator_init } from "./runtime/enumerator";
import { init as method_init } from "./runtime/method";
import { init as fiber_init } from "./runtime/fiber";
import { init as net_http_init } from "./lib/net/http";
import { init as uri_init } from "./lib/uri";
import { init as etc_init } from "./lib/etc";
import { init as pathname_init } from "./lib/pathname";
import { init as ruby_vm_init } from "./runtime/ruby-vm";
import { init as objspace_init } from "./lib/objspace";
import { init as objectspace_init} from "./runtime/object-space";
import { init as warning_init } from "./runtime/warning";
import { init as bigdecimal_init } from "./lib/bigdecimal";
import { obj_id_hash } from "./util/object_id";
import { RubyString } from "./runtime/string";
import { RubyArray } from "./runtime/array";
import { Symbol } from "./runtime/symbol";
import * as tty from "node:tty";
import { ParameterMetadata } from "./runtime/parameter-meta";
import { Hash } from "node:crypto";
import { Mutex } from "./util/mutex";

type ModuleDefinitionCallback = (module: Module) => void;
type ClassDefinitionCallback = (klass: Class) => void;

export type NativeMethod = (self: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: MethodCallData) => RValue | Promise<RValue>;

// used as the type for keys of the symbols weak map
type SymbolType = {
    name: string
}

type NativeExtension = {
    init_fn: () => void,
    inited: boolean
}

export class Runtime {
    static symbols: WeakMap<SymbolType, RValue> = new WeakMap();
    static native_extensions: {[key: string]: NativeExtension} = {};
    static require_mutex: Mutex = new Mutex();
    static load_mutex: Mutex = new Mutex();

    static define_module(name: string, cb?: ModuleDefinitionCallback): RValue {
        const obj = ObjectClass.get_data<Class>();

        if (!obj.constants[name]) {
            const module = new Module(name)
            const module_rval = new RValue(ModuleClass, module);
            module.rval = module_rval;
            obj.constants[name] = module_rval;
        }

        if (cb) {
            cb(obj.constants[name].get_data<Module>());
        }

        return obj.constants[name];
    }

    static define_module_under(parent: RValue, name: string, cb?: ModuleDefinitionCallback): RValue {
        const parent_mod = parent.get_data<Module>();

        if (!parent_mod.constants[name]) {
            const module = new Module(name, parent);
            const module_rval = new RValue(ModuleClass, module);
            module.rval = module_rval;
            parent_mod.constants[name] = module_rval;
        }

        if (cb) {
            cb(parent_mod.constants[name].get_data<Module>());
        }

        return parent_mod.constants[name];
    }

    static define_class(name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        const obj = ObjectClass.get_data<Class>();

        if (!obj.constants[name]) {
            if (superclass == Qnil) {
                superclass = ObjectClass;
            }

            const klass = new Class(name, superclass);
            const klass_rval = new RValue(ClassClass, klass);
            klass.rval = klass_rval;
            obj.constants[name] = klass_rval;
        }

        if (cb) {
            cb(obj.constants[name].get_data<Class>());
        }

        return obj.constants[name];
    }

    static define_class_under(parent: RValue, name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        const parent_mod = parent.get_data<Module>();

        if (!parent_mod.constants[name]) {
            if (superclass == Qnil) {
                superclass = ObjectClass;
            }

            const klass = new Class(name, superclass, false, parent);
            const klass_rval = new RValue(ClassClass, klass);
            klass.rval = klass_rval;
            parent_mod.constants[name] = klass_rval;
        }

        if (cb) {
            cb(parent_mod.constants[name].get_data<Class>());
        }

        return parent_mod.constants[name];
    }

    // This function works a little differently than MRI's rb_intern(). Since we don't use
    // symbols to define methods in yarv-js, there's no need to distinguish between so-called
    // "immortal" symbols created by the runtime and symbols created in user space - all
    // symbols can be garbage collected. So, whereas MRI's rb_intern() creates immortal symbols,
    // this function creates regular 'ol mortal symbols just as one might do in Ruby code. To
    // the runtime, it essentially exists as a convenient way to memoize strings so we don't
    // have to incur the overhead of making a bunch of new RValues all over the place.
    static async intern(value: string): Promise<RValue> {
        const key = {name: value};
        let symbol = this.symbols.get(key);

        if (!symbol) {
            symbol = new RValue(await Symbol.klass(), value);
            this.symbols.set(key, symbol);
        }

        return symbol;
    }

    static async each_unique_ancestor(mod: RValue, include_self: boolean = true, cb: (ancestor: RValue) => Promise<boolean>) {
        await this.each_unique_ancestor_helper(mod, new Set(), include_self, cb);
    }

    // Return false from cb() to exit early. Returning false from cb() will cause
    // each_ancestor to return false as well; otherwise it will return true.
    // Pass false for include_self to skip checking mod and prepended modules, i.e. if you're trying to
    // find a method somewhere above mod on the ancestry chain
    private static async each_unique_ancestor_helper(mod: RValue, seen: Set<RValue>, include_self: boolean, cb: (ancestor: RValue) => Promise<boolean>): Promise<boolean> {
        if (seen.has(mod)) return true;

        seen.add(mod);

        if (include_self) {
            // prepends are processed in reverse order (last prepended is first in ancestor chain)
            const prepends = mod.get_data<Module>().prepends;

            for (let i = prepends.length - 1; i >= 0; i --) {
                if (!(await this.each_unique_ancestor_helper(prepends[i], seen, true, cb))) {
                    return false;
                }
            }

            if (!(await cb(mod))) {
                return false;
            }

            // includes are processed in reverse order (last included is first in ancestor chain)
            const includes = mod.get_data<Module>().includes;

            for (let i = includes.length - 1; i >= 0; i --) {
                if (!(await this.each_unique_ancestor_helper(includes[i], seen, true, cb))) {
                    return false;
                }
            }
        }

        if (mod.klass === ClassClass) {
            const superclass = mod.get_data<Class>().superclass;

            if (superclass) {
                if (!(await this.each_unique_ancestor_helper(superclass, seen, true, cb))) {
                    return false;
                }
            }
        }

        return true;
    }

    static async assert_type(obj: RValue, type: Module): Promise<void>;
    static async assert_type(obj: RValue, type: RValue): Promise<void>;
    static async assert_type(obj: RValue, type: Module | RValue): Promise<void> {
        if (type instanceof Module) {
            if (obj.klass.get_data<Module>() !== type) {
                throw new TypeError(`no implicit conversion of ${obj.klass.get_data<Module>().name} into ${type.name}`);
            }
        } else {
            if (!(await Kernel.is_a(obj, type))) {
                throw new TypeError(`no implicit conversion of ${obj.klass.get_data<Module>().name} into ${type.get_data<Module>().name}`);
            }
        }
    }

    static async coerce_to_string(obj: RValue): Promise<RValue> {
        switch (obj.klass) {
            case await RubyString.klass():
            case await Symbol.klass():
                return obj;
            default:
                if (await Object.respond_to(obj, "to_str")) {
                    const str = await Object.send(obj, "to_str");

                    // make sure classes that inherit from String also work here
                    if (await Kernel.is_a(str, await RubyString.klass())) {
                        return str;
                    } else {
                        const obj_class_name = obj.klass.get_data<Class>().full_name;
                        const to_str_class_name = str.klass.get_data<Class>().full_name;
                        throw new TypeError(`can't convert ${obj_class_name} to String (${obj_class_name}#to_str gives ${to_str_class_name})`);
                    }
                } else {
                    const obj_class_name = obj.klass.get_data<Class>().full_name;
                    throw new TypeError(`no implicit conversion of ${obj_class_name} into String`);
                }
        }
    }

    static async coerce_all_to_string(objs: RValue[]): Promise<RValue[]> {
        const result = [];

        for (const obj of objs) {
            result.push(await this.coerce_to_string(obj));
        }

        return result;
    }

    static async coerce_to_array(obj: RValue): Promise<RValue> {
        if (await Object.respond_to(obj, "to_ary")) {
            const ary = await Object.send(obj, "to_ary");
            const is_array = await Object.send(ary, "is_a?", [await RubyArray.klass()])

            if (is_array.is_truthy()) {
                return ary;
            }

            // to_ary didn't return an array :(
            const class_name = obj.klass.get_data<Class>().name;
            const ary_class_name = ary.klass.get_data<Class>().name;
            throw new TypeError(`can't convert ${class_name} to Array (${class_name}#to_ary gives ${ary_class_name})`);
        }

        const class_name = obj.klass.get_data<Class>().name;
        throw new TypeError(`no implicit conversion of ${class_name} into Array`);
    }

    static async require(require_path: string): Promise<boolean> {
        require_path = vmfs.normalize_path(require_path);

        const ec = ExecutionContext.current;
        const absolute_path = vmfs.is_relative(require_path) ? this.find_on_load_path(require_path, false) : require_path;
        const loaded_features = ec.globals['$"'].get_data<RubyArray>().elements;

        if (absolute_path) {
            // required files are only evaluated once
            for (const loaded_feature of loaded_features) {
                if (loaded_feature.get_data<string>() === absolute_path) {
                    return false;
                }
            }

            await this.load(require_path, absolute_path);
            loaded_features.push(await RubyString.new(absolute_path!));
            return true;
        }

        if (this.native_extensions[require_path]) {
            for (const loaded_feature of loaded_features) {
                if (loaded_feature.get_data<string>() === require_path) {
                    return false;
                }
            }

            await this.load_native_extension(require_path);
            loaded_features.push(await RubyString.new(require_path));

            return true;
        }

        throw new LoadError(`cannot load such file -- ${require_path}`);
    }

    static async require_relative(path: string, requiring_path: string) {
        let require_path = path;

        if (vmfs.is_relative(path)) {
            require_path = vmfs.join_paths(vmfs.dirname(requiring_path), path);
            require_path = `${require_path}.rb`
        }

        return await this.require(require_path);
    }

    static async load(require_path: string, absolute_path: string | null): Promise<boolean> {
        if (!absolute_path) {
            throw new LoadError(`cannot load such file -- ${require_path}`);
        }

        return await this.load_absolute_path(require_path, absolute_path);
    }

    static async load_absolute_path(require_path: string, absolute_path: string): Promise<boolean> {
        const ec = ExecutionContext.current;

        if (this.native_extensions[absolute_path]) {
            return this.load_native_extension(absolute_path);
        }

        // Garnet does not support loading code in other encodings
        const code = new TextDecoder('utf8').decode(vmfs.read(absolute_path));
        const insns = Compiler.compile_string(code.toString(), require_path, absolute_path);
        await ec.run_top_frame(insns, ec.stack_len);

        return true;
    }

    private static find_on_load_path(path: string, assume_extension: boolean = true): string | null {
        const ec = ExecutionContext.current;
        const load_paths = ec.globals["$:"].get_data<RubyArray>().elements;
        const has_rb_ext = path.endsWith(".rb");

        for(let load_path of load_paths) {
            let absolute_path = vmfs.join_paths(load_path.get_data<string>(), path);
            if (!assume_extension && !has_rb_ext) absolute_path = `${absolute_path}.rb`;

            if (vmfs.is_file(absolute_path)) {
                return absolute_path;
            }
        }

        return null;
    };

    static register_native_extension(require_path: string, init_fn: () => Promise<void> | void) {
        this.native_extensions[require_path] = { init_fn, inited: false };
    }

    static async load_native_extension(require_path: string): Promise<boolean> {
        const ext = this.native_extensions[require_path];

        if (ext.inited) {
            return false;
        } else {
            ext.inited = true;
            await this.native_extensions[require_path].init_fn();
            return true;
        }
    }
}

Runtime.register_native_extension("rbconfig", rb_config_init);
Runtime.register_native_extension("stringio", stringio_init);
Runtime.register_native_extension("socket", socket_init);
Runtime.register_native_extension("date", date_init);
Runtime.register_native_extension("uri", uri_init);
Runtime.register_native_extension("net/http", net_http_init);
Runtime.register_native_extension("etc", etc_init);
Runtime.register_native_extension("pathname", pathname_init);
Runtime.register_native_extension("objspace", objspace_init);
Runtime.register_native_extension("bigdecimal", bigdecimal_init);

export enum Visibility {
    public,
    private,
    protected
};

export abstract class Callable {
    public visibility: Visibility;
    public owner?: Module;
    public ruby2_keywords: boolean = false;

    abstract call(context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: CallData): Promise<RValue>;
}

export class InterpretedCallable extends Callable {
    public name: string;
    public iseq: InstructionSequence;
    public nesting: RValue[];
    public owner?: Module;
    public parameters_meta: ParameterMetadata[];
    public lexical_scope: LexicalScope;

    constructor(name: string, iseq: InstructionSequence, visibility: Visibility, nesting: RValue[], parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope, owner?: Module) {
        super();

        this.name = name;
        this.iseq = iseq;
        this.visibility = visibility;
        this.nesting = nesting;
        this.parameters_meta = parameters_meta;
        this.lexical_scope = lexical_scope;
        this.owner = owner;
    }

    async call(context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: MethodCallData): Promise<RValue> {
        call_data ||= MethodCallData.create(this.name, args.length);

        // mark kwargs hash if this method is marked
        if (this.ruby2_keywords && kwargs && kwargs.length > 0) {
            // check if method accepts keywords (will be converted to positional hash if not)
            if (this.iseq.argument_options.keyword_bits_index === null && this.iseq.argument_options.keyword_rest_start === null) {
                kwargs.ruby2_keywords_hash = true;
            }
        }

        // handle ruby2_keywords for last positional hash argument
        if (this.ruby2_keywords && args.length > 0 && !kwargs) {
            const last_arg = args[args.length - 1];

            if (last_arg && last_arg.klass === await RubyHash.klass()) {
                const hash = last_arg.get_data<RubyHash>();

                if (!hash.ruby2_keywords_hash) {
                    const marked_hash = await Object.send(await RubyHash.klass(), "ruby2_keywords_hash", [last_arg]);
                    args = [...args.slice(0, -1), marked_hash];
                }
            }
        }

        return await context.run_method_frame(call_data, this.nesting, this.iseq, receiver, args, kwargs, block, this.owner);
    }
}

export class NativeCallable extends Callable {
    private method: NativeMethod;
    public owner?: Module;

    constructor(method: NativeMethod, visibility: Visibility = Visibility.public, owner?: Module) {
        super();

        this.method = method;
        this.visibility = visibility;
        this.owner = owner;
    }

    async call(_context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: MethodCallData): Promise<RValue> {
        // Native methods expect to be called with all positional arguments, so we unfurl splats here
        if (call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
            // splatted array is always the last element
            const splat_arr = args[call_data.argc - 1];

            if (splat_arr && splat_arr.klass === await RubyArray.klass()) {
                args = [
                    ...args.slice(0, call_data.argc - 1),
                    ...splat_arr.get_data<RubyArray>().elements
                ];
            }
        }

        if (call_data?.has_flag(CallDataFlag.KW_SPLAT_FWD)) {
            kwargs = args[args.length - 1].get_data<RubyHash>();
            args = args.slice(0, args.length - 1);
        }

        return await this.method(receiver, args, kwargs, block, call_data);
    }
}

export class Module {
    public name: string | null;
    public singleton_class?: RValue;
    public nesting_parent?: RValue;
    public default_visibility: Visibility = Visibility.public;
    public module_function_all: boolean = false;

    private temporary_name_: string | null;
    private constants_: {[key: string]: RValue};
    private deprecated_constants: {[key: string]: RValue};
    private methods_: {[key: string]: Callable};
    private removed_methods_: Set<string>;
    private undefined_methods_: Set<string>;
    private includes_: RValue[];
    private prepends_: RValue[];
    private autoloads_: Map<string, string>;

    private rval_: RValue;
    private full_name_rval_: RValue | null = null;

    private full_name_: string | null = null;
    private anonymous_name_str_: string | null = null;

    constructor(name: string | null, nesting_parent?: RValue) {
        this.name = name;
        this.nesting_parent = nesting_parent;
    }

    get constants(): {[key: string]: RValue} {
        if (!this.constants_) {
            this.constants_ = {};
        }

        return this.constants_;
    }

    get methods(): {[key: string]: Callable} {
        if (!this.methods_) {
            this.methods_ = {};
        }

        return this.methods_;
    }

    get removed_methods(): Set<string> {
        if (!this.removed_methods_) {
            this.removed_methods_ = new Set();
        }

        return this.removed_methods_;
    }

    get undefined_methods(): Set<string> {
        if (!this.undefined_methods_) {
            this.undefined_methods_ = new Set();
        }

        return this.undefined_methods_;
    }

    get includes(): RValue[] {
        if (!this.includes_) {
            this.includes_ = [];
        }

        return this.includes_;
    }

    get prepends(): RValue[] {
        if (!this.prepends_) {
            this.prepends_ = [];
        }

        return this.prepends_;
    }

    get autoloads(): Map<string, string> {
        if (!this.autoloads_) {
            this.autoloads_ = new Map();
        }

        return this.autoloads_;
    }

    add_autoload(constant: string, file: string) {
        this.autoloads.set(constant, file);
    }

    define_method(name: string, body: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        const callable = new InterpretedCallable(name, body, this.default_visibility, ExecutionContext.current.frame!.nesting, parameters_meta, lexical_scope, this);
        this.methods[name] = callable;

        // When module_function_all is set, also define the method on the singleton class
        if (this.module_function_all) {
            this.get_singleton_class().get_data<Module>().methods[name] = callable;
        }
    }

    define_native_method(name: string, body: NativeMethod, visibility?: Visibility) {
        this.methods[name] = new NativeCallable(body, visibility, this);
    }

    define_singleton_method(name: string, body: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        (this.get_singleton_class().get_data<Module>()).define_method(name, body, parameters_meta, lexical_scope);
    }

    define_native_singleton_method(name: string, body: NativeMethod) {
        (this.get_singleton_class().get_data<Module>()).define_native_method(name, body);
    }

    async alias_method(new_name: string, existing_name: string) {
        const method = await Object.find_instance_method_under(this.rval, existing_name, true);

        if (method) {
            this.methods[new_name] = method;
        } else {
            const type = this instanceof Class ? "class" : "module";
            throw new NameError(`undefined method \`${existing_name}' for ${type} \`${this.name}'`);
        }
    }

    async alias_variable(new_name: string, existing_name: string) {
        const ec = ExecutionContext.current;

        if (ec) {
            const canonical_name = ec.resolve_global_alias(existing_name);
            ec.global_aliases[new_name] = canonical_name;

            // if new_name already had a value, we need to remove it since it's now an alias
            if (ec.globals[new_name] !== undefined && new_name !== canonical_name) {
                delete ec.globals[new_name];
            }
        }
    }

    remove_method(name: string) {
        this.removed_methods.add(name);
    }

    undef_method(name: string) {
        this.undefined_methods.add(name);
    }

    deprecate_constant(name: string, constant: RValue) {
        if (!this.deprecated_constants) {
            this.deprecated_constants = {};
        }

        this.deprecated_constants[name] = constant;
    }

    has_deprecated_constant(name: string, value: RValue): boolean {
        if (this.deprecated_constants) {
            return this.deprecated_constants[name] === value;
        }

        return false;
    }

    // Constant lookup searches for constants that are defined in `Module.nesting`,
    // `Module.nesting.first.ancestors`, and `Object.ancestors` if `Module.nesting.first`
    // is nil or a module.
    async find_constant(name: string): Promise<RValue | null> {
        let constant = await this.find_constant_in_self(name);
        if (constant) return constant;

        constant = await this.find_constant_in_module_nesting(name);
        if (constant) return constant;

        if (!this.nesting_parent || this.nesting_parent.klass === ModuleClass) {
            constant = ObjectClass.get_data<Class>().constants[name] || null;

            if (constant && this.has_deprecated_constant(name, constant)) {
                STDERR.get_data<IO>().puts(`warning: constant ${name} is deprecated`)
            }

            return constant;
        } else {
            return this.find_constant_in_ancestors(name);
        }
    }

    private async find_constant_in_self(name: string): Promise<RValue | null> {
        let constant = this.constants[name];
        if (constant) return constant;

        await this.maybe_autoload_constant(name, this);
        constant = this.constants[name];
        if (constant) return constant;

        return null;
    }

    private async find_constant_in_module_nesting(name: string): Promise<RValue | null> {
        const ec = ExecutionContext.current;
        if (!ec || !ec.frame) return null;

        // check direct constants of each nesting module
        for (let i = ec.frame.nesting.length - 1; i >= 0; i --) {
            const current_mod_rval = ec.frame.nesting[i];
            const current_mod = current_mod_rval.get_data<Module>();
            let constant: RValue | null = current_mod.constants[name];
            if (constant) return constant;

            constant = await this.maybe_autoload_constant(name, current_mod);
            if (constant) return constant;
        }

        // Search the ancestors of the innermost module in the nesting. This should search up
        // the ancestor chain by virtue of the fact we're calling find_constant_in_ancestors.
        if (ec.frame.nesting.length > 0) {
            const innermost_mod_rval = ec.frame.nesting[ec.frame.nesting.length - 1];
            const innermost_mod = innermost_mod_rval.get_data<Module>();
            const constant = await innermost_mod.find_constant_in_ancestors(name);
            if (constant) return constant;
        }

        return null;
    }

    private async maybe_autoload_constant(name: string, mod: Module) : Promise<RValue | null> {
        if (mod.autoloads.has(name)) {
            const file = mod.autoloads.get(name)!;
            mod.autoloads.delete(name);
            await Runtime.require(file);
            const constant = mod.constants[name];

            if (constant) {
                if (mod.has_deprecated_constant(name, constant)) {
                    STDERR.get_data<IO>().puts(`warning: constant ${name} is deprecated`)
                }

                return constant;
            } else {
                mod.autoloads.set(name, file);
            }
        }

        return null;
    }

    async find_constant_in_ancestors(name: string): Promise<RValue | null> {
        let constant: RValue | null = null;
        let parent_mod: Module | null = null;

        await Runtime.each_unique_ancestor(this.rval, true, async (ancestor: RValue): Promise<boolean> => {
            if (ancestor.get_data<Module>().name === name) {
                constant = ancestor;
                return false;
            }

            parent_mod = ancestor.get_data<Module>();
            constant = parent_mod.constants[name];
            if (constant) return false;

            constant = await this.maybe_autoload_constant(name, parent_mod);
            if (constant) return false;

            return true;
        });

        if (parent_mod && (parent_mod as Module).has_deprecated_constant(name, constant!)) {
            STDERR.get_data<IO>().puts(`warning: constant ${name} is deprecated`)
        }

        return constant;
    }

    include(mod: RValue) {
        this.includes.push(mod);
    }

    extend(mod: RValue) {
        (this.get_singleton_class().get_data<Class>()).include(mod);
    }

    prepend(mod: RValue) {
        this.prepends.push(mod);
    }

    get_singleton_class(): RValue {
        if (!this.singleton_class) {
            const singleton_klass = new Class(`Class:${this.name}`, ModuleClass, true);
            singleton_klass.attached_object = this.rval;  // Store reference to the module this singleton is attached to
            this.singleton_class = new RValue(ClassClass.klass, singleton_klass);
            singleton_klass.rval = this.singleton_class;
        }

        return this.singleton_class;
    }

    has_singleton_class(): boolean {
        return Boolean(this.singleton_class)
    }

    async tap(cb: (mod: Module) => Promise<void>) {
        await cb(this);
    }

    inspect(): string {
        return `module ${this.name}`;
    }

    get full_name(): string {
        if (!this.full_name_) {
            let cur_parent_rval: RValue | undefined = this.rval;
            const parts = [];

            while (cur_parent_rval && cur_parent_rval != ObjectClass) {
                const cur_parent: Module = cur_parent_rval.get_data<Module>();

                if (cur_parent.name) {
                    parts.unshift(cur_parent.name);
                } else {
                    parts.unshift(cur_parent.anonymous_name_str);
                }

                cur_parent_rval = cur_parent.nesting_parent;
            }

            this.full_name_ = parts.join("::");
        }

        return this.full_name_;
    }

    get anonymous_name_str(): string {
        if (this.temporary_name) {
            return this.temporary_name;
        }

        if (!this.anonymous_name_str_) {
            const type_str = (this instanceof Module) ? "Module" : "Class";
            this.anonymous_name_str_ = `#<${type_str}:${Object.object_id_to_str(this.rval.object_id)}>`
        }

        return this.anonymous_name_str_;
    }

    async full_name_rval(): Promise<RValue> {
        if (!this.full_name_rval_) {
            this.full_name_rval_ = await RubyString.new(this.full_name);
            this.full_name_rval_.freeze();
        }

        return this.full_name_rval_;
    }

    get temporary_name(): string | null {
        return this.temporary_name_;
    }

    set temporary_name(new_name: string | null) {
        this.temporary_name_ = new_name;
        this.full_name_ = null;
        this.full_name_rval_ = null;
        this.anonymous_name_str_ = null;
    }

    get rval(): RValue {
        return this.rval_;
    }

    set rval(val: RValue) {
        this.rval_ = val;
    }
}

let next_object_id = 0;

export class RValue {
    public klass: RValue;
    public ivars: Map<string, RValue>;
    public data: any;
    public object_id: number;
    public frozen: boolean;

    private singleton_class: RValue | undefined;
    private context_?: {[key: string | number]: any};

    constructor(klass: RValue, data?: any) {
        this.klass = klass;
        this.data = data;
        this.object_id = next_object_id;
        this.frozen = false;
        next_object_id ++;
    }

    get_data<T>(): T {
        return this.data as T;
    }

    iv_set(name: string, value: RValue) {
        if (!this.ivars) {
            this.ivars = new Map();
        }

        this.ivars.set(name, value);
    }

    iv_get(name: string): RValue {
        if (!this.ivars) {
            return Qnil;
        }

        if (this.ivars.has(name)) {
            return this.ivars.get(name)!;
        }

        return Qnil;
    }

    iv_exists(name: string): boolean {
        if (!this.ivars) {
            return false;
        }

        return this.ivars.has(name);
    }

    async cvar_get(name: string): Promise<RValue> {
        let result: RValue = Qnil;

        await Runtime.each_unique_ancestor(this, true, async (ancestor: RValue): Promise<boolean> => {
            if (ancestor.iv_exists(name)) {
                result = ancestor.iv_get(name);
                return false; // found it, stop searching
            }

            return true; // keep searching
        });

        return result;
    }

    async cvar_set(name: string, value: RValue): Promise<void> {
        let found = false;

        await Runtime.each_unique_ancestor(this, true, async (ancestor: RValue): Promise<boolean> => {
            if (ancestor.iv_exists(name)) {
                ancestor.iv_set(name, value);
                found = true;
                return false; // found it, stop searching
            }

            return true; // keep searching
        });

        // if not found on any ancestor, set it on self
        if (!found) {
            this.iv_set(name, value);
        }
    }

    async cvar_exists(name: string): Promise<boolean> {
        let exists = false;

        await Runtime.each_unique_ancestor(this, true, async (ancestor: RValue): Promise<boolean> => {
            if (ancestor.iv_exists(name)) {
                exists = true;
                return false; // found it, stop searching
            }

            return true; // keep searching
        });

        return exists;
    }

    is_truthy() {
        return this != Qfalse && this.klass != NilClass;
    }

    is_frozen(): boolean {
        return this.frozen;
    }

    freeze() {
        this.frozen = true;
    }

    get_singleton_class(): RValue {
        if (this.data instanceof Module) {
            return this.get_data<Module>().get_singleton_class();
        }

        if (!this.singleton_class) {
            let name = `#<Class:${this.klass.get_data<Class>().full_name}:${Object.object_id_to_str(this.object_id)}>`
            const klass = new Class(name, this.klass, true);
            klass.attached_object = this;  // Store reference to the object this singleton is attached to
            this.singleton_class = new RValue(ClassClass, klass);
            klass.rval = this.singleton_class;
        }

        return this.singleton_class;
    }

    has_singleton_class(): boolean {
        if (this.singleton_class) {
            return true
        }

        if (this.data instanceof Module) {
            return true
        }

        return false;
    }

    get_context<T extends {[key: string | number]: any}>(): T {
        if (!this.context_) {
            this.context_ = {};
        }

        return this.context_ as T;
    }

    has_context(): boolean {
        return !!this.context_;
    }
}

export class RValuePointer {
    public rval: RValue;
    public id: number;

    private static next_id: number = 0;

    constructor(rval: RValue) {
        this.rval = rval;
        this.id = RValuePointer.next_id ++;
    }
}

export class Class extends Module {
    public superclass: RValue | null;
    public is_singleton_class: boolean;
    public attached_object?: RValue;  // for singleton classes, the object they're attached to

    // name: can be null in the case of an anonymous class.
    // superclass: can be null in the case of BasicObject. Certain fundamental classes like Class and Object that are defined
    // in terms of each other also have superclass set to null very briefly before the VM is fully initialized.
    constructor(name: string | null, superclass: RValue | null, is_singleton_class: boolean = false, nesting_parent?: RValue) {
        super(name, nesting_parent);

        this.superclass = superclass;
        this.is_singleton_class = is_singleton_class;
    }

    get_singleton_class(): RValue {
        if (!this.singleton_class) {
            let superclass_singleton: RValue;

            if (this.superclass) {
                superclass_singleton = this.superclass.get_data<Class>().get_singleton_class();
            } else {
                // Make sure this class isn't Object so we avoid an infinite loop
                // Also make sure this class isn't Module, which has no superclass
                superclass_singleton = ClassClass;
            }

            const singleton_klass = new Class(`Class:${this.full_name}`, superclass_singleton, true);
            singleton_klass.attached_object = this.rval;  // Store reference to the class this singleton is attached to
            this.singleton_class = new RValue(ClassClass, singleton_klass);
            singleton_klass.rval = this.singleton_class;
        }

        return this.singleton_class;
    }

    async tap(cb: (klass: Class) => Promise<void>) {
        await cb(this);
    }
}

const basic_object_class = new Class("BasicObject", null);
const object_class = new Class("Object", null);
const module_class = new Class("Module", null);
const class_class = new Class("Class", null);

// This is some nasty hackery to be able to set Class's class to Class.
export const ClassClass       = object_class.constants["Class"]       = new RValue(null as unknown as RValue, class_class);
ClassClass.klass = ClassClass;

export const ModuleClass      = object_class.constants["Module"]      = new RValue(ClassClass, module_class);
class_class.superclass = ModuleClass;

export const BasicObjectClass = object_class.constants["BasicObject"] = new RValue(ClassClass, basic_object_class);
export const ObjectClass      = object_class.constants["Object"]      = new RValue(ClassClass, object_class);
export const NilClass         = object_class.constants["NilClass"]    = new RValue(ClassClass, new Class("NilClass", ObjectClass));
export const TrueClass        = object_class.constants["TrueClass"]   = new RValue(ClassClass, new Class("TrueClass", ObjectClass));
export const FalseClass       = object_class.constants["FalseClass"]  = new RValue(ClassClass, new Class("FalseClass", ObjectClass));
export const KernelModule     = object_class.constants["Kernel"]      = new RValue(ModuleClass, new Module("Kernel"));

// Normally assigning rval is done by Runtime.define_class and friends, but since we have to
// construct RValues manually above, the rval property has to be set manually as well.
basic_object_class.rval = BasicObjectClass;
object_class.rval = ObjectClass;
module_class.rval = ModuleClass;
class_class.rval = ClassClass;
NilClass.get_data<Class>().rval = NilClass;
TrueClass.get_data<Class>().rval = TrueClass;
FalseClass.get_data<Class>().rval = FalseClass;
KernelModule.get_data<Class>().rval = KernelModule;

object_class.superclass = BasicObjectClass;
module_class.superclass = ObjectClass;
class_class.superclass = ModuleClass;

// an RValue that wraps Runtime
const ConstBase = new RValue(new RValue(ClassClass, new Class("ConstBase", null)), Runtime);
export { ConstBase };

export const Main = new RValue(ObjectClass);
export const Qnil = new RValue(NilClass, null);
export const Qtrue = new RValue(TrueClass, true);
export const Qfalse = new RValue(FalseClass, false);

export const VMCoreClass = Runtime.define_class("VMCore", ObjectClass, (klass: Class) => {
    klass.define_native_method("hash_merge_kwd", async (self: RValue, args: RValue[]): Promise<RValue> => {
        // @TODO: can we do this without creating a new hash?
        const new_hash = new RubyHash();

        for (const arg of args) {
            await arg.get_data<RubyHash>().each(async (k: RValue, v: RValue) => {
                await new_hash.set(k, v);
            });
        }

        return await RubyHash.from_hash(new_hash);
    });

    klass.define_native_method("hash_merge_ptr", async (self: RValue, args: RValue[]): Promise<RValue> => {
        // @TODO: can we do this without creating a new hash?
        const new_hash = new RubyHash();
        const old_hash = args[0].get_data<RubyHash>();

        await old_hash.each(async (k: RValue, v: RValue) => {
            await new_hash.set(k, v);
        });

        for (let i = 1; i < args.length; i += 2) {
            await new_hash.set(args[i], args[i + 1]);
        }

        return await RubyHash.from_hash(new_hash);
    });

    klass.define_native_method("set_method_alias", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        const klass = args[0].get_data<Class>();
        const new_name = args[1].get_data<string>();
        const old_name = args[2].get_data<string>();
        await klass.alias_method(new_name, old_name);
        return Qnil;
    });

    klass.define_native_method("set_variable_alias", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const klass = args[0].get_data<Class>();
        const new_name = args[1].get_data<string>();
        const old_name = args[2].get_data<string>();
        await klass.alias_variable(new_name, old_name);
        return Qnil;
    });

    klass.define_native_method("set_postexe", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("set_postexe is not implemented yet");
    });

    klass.define_native_method("undef_method", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("undef_method is not implemented yet");
    });
});

export const VMCore = new RValue(VMCoreClass);

await NilClass.get_data<Class>().tap(async (klass: Class) => {
    klass.define_native_method("inspect", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("nil");
    });

    klass.define_native_method("to_i", async (_self: RValue): Promise<RValue> => {
        return await Integer.get(0);
    });

    klass.define_native_method("to_s", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("");
    });

    klass.define_native_method("any?", (_self: RValue): RValue => {
        return Qfalse;
    });

    klass.define_native_method("nil?", (_self: RValue): RValue => {
        return Qtrue;
    });

    klass.define_native_method("!", (_self: RValue): RValue => {
        return Qtrue;
    });

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return self === args[0] ? Qtrue : Qfalse;
    });
});

await TrueClass.get_data<Class>().tap(async (klass: Class) => {
    klass.define_native_method("inspect", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("true");
    });

    klass.define_native_method("to_s", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("true");
    });

    klass.define_native_method("^", (_self: RValue, args: RValue[]): RValue => {
        return !args[0].is_truthy() ? Qtrue : Qfalse;
    });

    klass.define_native_method("!", (_self: RValue): RValue => {
        return Qfalse;
    });

    klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
        if (!self.iv_exists("@__hash")) {
            self.iv_set("@__hash", await Integer.get(obj_id_hash(self.object_id)));
        }

        return self.iv_get("@__hash");
    });

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return self === args[0] ? Qtrue : Qfalse;
    });
});

await FalseClass.get_data<Class>().tap(async (klass: Class) => {
    klass.define_native_method("inspect", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("false");
    });

    klass.define_native_method("to_s", async (_self: RValue): Promise<RValue> => {
        return await RubyString.new("false");
    });

    klass.define_native_method("^", (_self: RValue, args: RValue[]): RValue => {
        return !args[0].is_truthy() ? Qfalse : Qtrue;
    });

    klass.define_native_method("!", (_self: RValue): RValue => {
        return Qtrue;
    });

    klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
        if (!self.iv_exists("@__hash")) {
            self.iv_set("@__hash", await Integer.get(obj_id_hash(self.object_id)));
        }

        return self.iv_get("@__hash");
    });

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return self === args[0] ? Qtrue : Qfalse;
    });
});

await (ClassClass.get_data<Class>()).tap(async (klass: Class) => {
    // create a new instance of the Class class, i.e. create a new user-defined class
    klass.define_native_singleton_method("new", async (self: RValue, args: RValue[], _kwargs?: RubyHash, block?: RValue): Promise<RValue> => {
        const superclass = args[0] || ObjectClass;
        const new_class = new Class(null, superclass);
        const new_class_rval = new RValue(ClassClass, new_class);
        new_class.rval = new_class_rval;

        if (block) {
            const proc = block!.get_data<Proc>();
            // nesting should include the class being evaluated
            const new_nesting = [...proc.binding.nesting, new_class_rval];
            const binding = proc.binding.with_self_and_nesting(new_class_rval, new_nesting);
            await proc.with_binding(binding).call(ExecutionContext.current, [new_class_rval]);
        }

        return new_class_rval;
    });

    klass.define_native_method("superclass", (self: RValue): RValue => {
        return self.get_data<Class>().superclass || Qnil;
    });

    // allocate a new instance of a class - this is an instance method on the class "Class" and allocates
    // a new instance of a user-defined class
    klass.define_native_method("allocate", (self: RValue): RValue => {
        return new RValue(self);
    });

    // create a new instance of a class - this is an instance method on the class "Class" and initializes
    // a new instance of a user-defined class
    klass.define_native_method("new", async (self: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue): Promise<RValue> => {
        const obj = await Object.send(self, "allocate");
        await Object.send(obj, "initialize", args, kwargs, block);
        return obj;
    });

    klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
        return await RubyString.new(self.get_data<Class>().full_name);
    });

    await klass.alias_method("to_s", "inspect");
});

await (BasicObjectClass.get_data<Class>()).tap(async (klass: Class) => {
    klass.define_native_method("initialize", (_self: RValue): RValue => {
        return Qnil;
    });

    klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
        return self.object_id == args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("equal?", (self: RValue, args: RValue[]): RValue => {
        return self.object_id == args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("!", (self: RValue): RValue => {
        return self.is_truthy() ? Qfalse : Qtrue;
    });

    klass.define_native_method("!=", (self: RValue, args: RValue[]): RValue => {
        return self.object_id != args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("instance_exec", async (self: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
        const proc = block!.get_data<Proc>();
        const binding = proc.binding.with_self(self);
        let block_call_data: BlockCallData | undefined = undefined;

        if (call_data) {
            block_call_data = BlockCallData.create(call_data.argc, call_data.flag, call_data.kw_arg);
        }

        return await proc.with_binding(binding).call(ExecutionContext.current, args, kwargs, undefined, block_call_data);
    });

    klass.define_native_method("method_missing", (self: RValue, args: RValue[]): RValue => {
        // this is kinda broken until I can figure out how to inspect objects with cycles; for now,
        // just print out self's type

        // const inspect_str = Object.send(self, "inspect").get_data<string>();
        // throw new NoMethodError(`undefined method \`${method_name}' for ${inspect_str}`);
        const method_name = args[0].get_data<string>();
        let inspect_str;

        switch (self.klass) {
            case ClassClass:
                inspect_str = `class ${self.get_data<Class>().name}`;
                break;
            case ModuleClass:
                inspect_str = `module ${self.get_data<Module>().name}`;
                break;
            default:
                inspect_str = `an instance of ${self.klass.get_data<Class>().name}`;
                break;
        }

        throw new NoMethodError(`undefined method \`${method_name}' for ${inspect_str}`);
    });

    klass.define_native_method("__send__", async (self: RValue, args: RValue[], kwargs?: RubyHash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
        const method_name = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        let send_call_data;

        if (call_data) {
            send_call_data = MethodCallData.create(
                method_name, call_data.argc - 1, call_data.flag, call_data.kw_arg
            );
        } else {
            let flags = CallDataFlag.ARGS_SIMPLE;
            if (block) flags |= CallDataFlag.ARGS_BLOCKARG;

            send_call_data = MethodCallData.create(
                method_name, args.length - 1, flags
            );
        }

        return Object.send(self, send_call_data, args.slice(1), kwargs, block);
    });
});

export interface IO {
    puts(val: string): void;
    write(val: string): void;
    is_tty(): boolean;
}

export type ConsoleFn = (...data: string[]) => void;
export class BrowserIO implements IO {
    // this is all kinds of wrong but it's fine for now
    static new(console_fn: ConsoleFn): RValue {
        return new RValue(IOClass, new BrowserIO(console_fn));
    }

    private console_fn: ConsoleFn;

    constructor(console_fn: ConsoleFn) {
        this.console_fn = console_fn;
    }

    puts(val: string): void {
        this.console_fn(val);
    }

    write(val: string): void {
        this.console_fn(val);
    }

    is_tty(): boolean {
        return false;
    }
}

export class NodeIO implements IO {
    private stream: NodeJS.WriteStream;

    static new(stream: NodeJS.WriteStream) {
        return new RValue(IOClass, new NodeIO(stream));
    }

    constructor(stream: NodeJS.WriteStream) {
        this.stream = stream;
    }

    puts(val: string): void {
        this.stream.write(val);
        this.stream.write("\n");
    }

    write(val: string): void {
        this.stream.write(val);
    }

    is_tty(): boolean {
        return this.stream.isTTY;
    }
}

export const IOClass = Runtime.define_class("IO", ObjectClass, async (klass: Class) => {
    klass.define_native_method("puts", async (self: RValue, args: RValue[], _kwargs?: RubyHash, _block?: RValue, _call_data?: MethodCallData): Promise<RValue> => {
        const io = self.get_data<IO>();

        for (const arg of args) {
            // Check if the argument is an array (or can be converted to one via to_ary);
            // `puts` flattens arrays regardless of whether they were splatted.
            if (arg.klass === await RubyArray.klass()) {
                for (const elem of arg.get_data<RubyArray>().elements) {
                    io.puts((await Object.send(elem, "to_s")).get_data<string>());
                }
            } else {
                // Try to convert to array via to_ary. `puts` always tries to call to_ary,
                // even if it's not defined (which will trigger a method_missing)
                try {
                    const ary = await Runtime.coerce_to_array(arg);

                    for (const elem of ary.get_data<RubyArray>().elements) {
                        io.puts((await Object.send(elem, "to_s")).get_data<string>());
                    }
                } catch (e) {
                    // if to_ary raises a TypeError, just use to_s
                    if (e instanceof TypeError) {
                        io.puts((await Object.send(arg, "to_s")).get_data<string>());
                    } else {
                        throw e;
                    }
                }
            }
        }

        return Qnil;
    });

    klass.define_native_method("write", async (self: RValue, args: RValue[], _kwargs?: RubyHash, _block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
        const io = self.get_data<IO>();

        for (const arg of args) {
            // this shouldn't be necessary anymore?
            if (arg.klass === await RubyArray.klass() && call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
                for (const elem of arg.get_data<RubyArray>().elements) {
                    io.write((await Object.send(elem, "to_s")).get_data<string>());
                }
            } else {
                io.write((await Object.send(arg, "to_s")).get_data<string>());
            }
        }

        return Qnil;
    });

    await klass.alias_method("print", "write");

    klass.define_native_method("flush", (self: RValue): RValue => {
        // @TODO: what needs to be done here?
        return self;
    });

    klass.define_native_method("isatty", (self: RValue): RValue => {
        return self.get_data<IO>().is_tty() ? Qtrue : Qfalse;
    });

    await klass.alias_method("tty?", "isatty");
});

export const STDOUT = ObjectClass.get_data<Class>().constants["STDOUT"] = is_node ? NodeIO.new(process.stdout) : BrowserIO.new(console.log);
export const STDERR = ObjectClass.get_data<Class>().constants["STDERR"] = is_node ? NodeIO.new(process.stderr) : BrowserIO.new(console.error);

export const init = async () => {
    await module_init();
    string_init();
    comparable_init();
    numeric_init();
    await rational_init();
    await integer_init();
    await float_init();
    symbol_init();
    await enumerable_init();
    await enumerator_init();
    hash_init();
    proc_init();
    error_init();
    process_init();
    env_init();
    await file_init();
    dir_init();
    await kernel_init();
    await object_init();
    range_init();
    binding_init();
    await signal_init();
    time_init();
    thread_init();
    await regexp_init();
    await encoding_init();
    array_init();
    struct_init();
    await method_init();
    await fiber_init();
    await pathname_init();
    ruby_vm_init();
    objectspace_init();
    warning_init();

    ObjectClass.get_data<Class>().constants["RUBY_PLATFORM"] = await (async () => {
        if (is_node) {
            let arch: string = process.arch;
            if (arch === "x64") arch = "x86_64";

            const platform = process.platform;
            // const release = (await import("os")).release().split(".")[0];
            const release = "foo";

            return RubyString.new(`${arch}-${platform}${release}`);
        } else {
            const userAgent = window.navigator.userAgent.toLowerCase();
            const browser =
              userAgent.indexOf('edge') > -1 ? 'edge'
                : userAgent.indexOf('edg') > -1 ? 'chromium-edge'
                : userAgent.indexOf('opr') > -1 && !!(window as any).opr ? 'opera'
                : userAgent.indexOf('chrome') > -1 && !!(window as any).chrome ? 'chrome'
                : userAgent.indexOf('trident') > -1 ? 'ie'
                : userAgent.indexOf('firefox') > -1 ? 'firefox'
                : userAgent.indexOf('safari') > -1 ? 'safari'
                : 'other';

            const platform = (() => {
                // 2022 way of detecting. Note : this userAgentData feature is available only in secure contexts (HTTPS)
                if (typeof (navigator as any).userAgentData !== 'undefined' && (navigator as any).userAgentData != null) {
                    return (navigator as any).userAgentData.platform;
                }
                // Deprecated but still works for most of the browsers
                if (typeof navigator.platform !== 'undefined') {
                    if (typeof navigator.userAgent !== 'undefined' && /android/.test(navigator.userAgent.toLowerCase())) {
                        // android device’s navigator.platform is often set as 'linux', so let’s use userAgent for them
                        return 'android';
                    }
                    return navigator.platform;
                }
                return 'unknown';
            })();

            return RubyString.new(`${browser}-${platform}`);
        }
    })();

    ObjectClass.get_data<Class>().constants["RUBY_VERSION"] = await RubyString.new("3.2.2");
    ObjectClass.get_data<Class>().constants["RUBY_ENGINE"] = await RubyString.new("Garnet.js");

    ObjectClass.get_data<Class>().constants["RUBY_DESCRIPTION"] = await RubyString.new(
        `Garnet.js ${ObjectClass.get_data<Class>().constants["RUBY_VERSION"].get_data<string>()} [${ObjectClass.get_data<Class>().constants["RUBY_PLATFORM"].get_data<string>()}]`
    );

    if (is_node) {
        await Dir.setwd(process.env.PWD!);
    } else {
        await Dir.setwd(vmfs.root_path());
    }
}
