import { InstructionSequence } from "./instruction_sequence";
import { Compiler } from "./compiler";
import { LoadError, TypeError, NoMethodError, NotImplementedError, NameError } from "./errors";
import { CallingConvention, ExecutionContext } from "./execution_context";
import { init as array_init } from "./runtime/array";
import { Integer, init as integer_init } from "./runtime/integer";
import { Object } from "./runtime/object";
import { init as symbol_init } from "./runtime/symbol";
import { init as string_init } from "./runtime/string";
import { Dir } from "./runtime/dir";
import { vmfs } from "./vmfs";
import { Proc, init as proc_init } from "./runtime/proc";
import { init as hash_init } from "./runtime/hash";
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
import { init as thread_init } from './lib/thread';
import { init as regexp_init} from "./runtime/regexp";
import { init as encoding_init } from "./runtime/encoding";
import { init as struct_init } from "./runtime/struct";
import { init as rational_init } from "./runtime/rational";
import { obj_id_hash } from "./util/object_id";
import { String } from "./runtime/string";
import { RubyArray } from "./runtime/array";
import * as tty from "node:tty";

type ModuleDefinitionCallback = (module: Module) => void;
type ClassDefinitionCallback = (klass: Class) => void;

export type NativeMethod = (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData) => RValue;
export type Kwargs = Map<string, RValue>;

export class KwargsHash {
    private kwargs: Kwargs;

    constructor(kwargs: Kwargs) {
        this.kwargs = kwargs;
    }

    get(key: RValue) {
        Runtime.assert_type(key, SymbolClass);
        return this.kwargs.get(key.get_data<string>());
    }
}

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
    static intern(value: string): RValue {
        const key = {name: value};
        let symbol = this.symbols.get(key);

        if (!symbol) {
            symbol = new RValue(SymbolClass, value);
            this.symbols.set(key, symbol);
        }

        return symbol;
    }

    static each_unique_ancestor(mod: RValue, include_self: boolean = true, cb: (ancestor: RValue) => boolean) {
        this.each_unique_ancestor_helper(mod, new Set(), include_self, cb);
    }

    // Return false from cb() to exit early. Returning false from cb() will cause
    // each_ancestor to return false as well; otherwise it will return true.
    // Pass false for include_self to skip checking mod and prepended modules, i.e. if you're trying to
    // find a method somewhere above mod on the ancestry chain
    private static each_unique_ancestor_helper(mod: RValue, seen: Set<RValue>, include_self: boolean, cb: (ancestor: RValue) => boolean): boolean {
        if (seen.has(mod)) return true;

        seen.add(mod);

        if (include_self) {
            for (const prepend of mod.get_data<Module>().prepends) {
                if (!cb(prepend)) {
                    return false;
                }

                if (!this.each_unique_ancestor_helper(prepend, seen, true, cb)) {
                    return false;
                }
            }

            if (!cb(mod)) {
                return false;
            }

            for (const include of mod.get_data<Module>().includes) {
                if (!cb(include)) {
                    return false;
                }

                if (!this.each_unique_ancestor_helper(include, seen, true, cb)) {
                    return false;
                }
            }
        }

        if (mod.klass === ClassClass) {
            const superclass = mod.get_data<Class>().superclass;

            if (superclass) {
                if (!cb(superclass)) {
                    return false;
                }

                if (!this.each_unique_ancestor_helper(superclass, seen, true, cb)) {
                    return false;
                }
            }
        }

        return true;
    }

    static assert_type(obj: RValue, type: Module): void;
    static assert_type(obj: RValue, type: RValue): void;
    static assert_type(obj: RValue, type: Module | RValue) {
        if (type instanceof Module) {
            if (obj.klass.get_data<Module>() !== type) {
                throw new TypeError(`no implicit conversion of ${obj.klass.get_data<Module>().name} into ${type.name}`);
            }
        } else {
            if (!Kernel.is_a(obj, type)) {
                throw new TypeError(`no implicit conversion of ${obj.klass.get_data<Module>().name} into ${type.get_data<Module>().name}`);
            }
        }
    }

    static coerce_to_string(obj: RValue): RValue {
        switch (obj.klass) {
            case String.klass:
            case SymbolClass:
                return obj;
            default:
                if (Object.respond_to(obj, "to_str")) {
                    const str = Object.send(obj, "to_str");

                    // make sure classes that inherit from String also work here
                    if (Kernel.is_a(str, String.klass)) {
                        return str;
                    } else {
                        const obj_class_name = obj.klass.get_data<Class>().name;
                        const to_str_class_name = str.klass.get_data<Class>().name;
                        throw new TypeError(`can't convert ${obj_class_name} to String (${obj_class_name}#to_str gives ${to_str_class_name})`);
                    }
                } else {
                    const obj_class_name = obj.klass.get_data<Class>().name;
                    throw new TypeError(`no implicit conversion of ${obj_class_name} into String`);
                }
        }
    }

    static require(path: string): boolean {
        // console.log(`Require ${path}`);
        const ec = ExecutionContext.current;
        const loaded_features = ec.globals['$"'].get_data<RubyArray>().elements;
        const full_path = this.find_on_load_path(path) || path;

        // required files are only evaluated once
        for (const loaded_feature of loaded_features) {
            if (loaded_feature.get_data<string>() === full_path) {
                return false;
            }
        }

        if (this.native_extensions[full_path]) {
            this.load_native_extension(full_path);
        } else {
            if (!full_path) {
                throw new LoadError(`cannot load such file -- ${path}`);
            }

            this.load(full_path);
        }

        loaded_features.push(String.new(full_path));

        return true;
    }

    static require_relative(path: string, requiring_path: string) {
        // console.log(`Require relative ${path}`);

        let require_path = path;

        if (vmfs.is_relative(path)) {
            require_path = vmfs.join_paths(vmfs.dirname(requiring_path), path);
            require_path = `${require_path}.rb`
        }

        return this.require(require_path);
    }

    static load(path: string): boolean {
        // console.log(`Load ${path}`);
        const ec = ExecutionContext.current;
        const full_path = vmfs.is_relative(path) ? this.find_on_load_path(path, false) : path;

        if (!full_path) {
            if (this.native_extensions[path]) {
                return this.load_native_extension(path);
            }

            throw new LoadError(`cannot load such file -- ${path}`);
        }

        const code = vmfs.read(full_path);
        const insns = Compiler.compile_string(code.toString(), full_path);
        ec.run_top_frame(insns, ec.stack_len);

        return true;
    }

    private static find_on_load_path(path: string, assume_extension: boolean = true): string | null {
        const ec = ExecutionContext.current;
        const load_paths = ec.globals["$:"].get_data<RubyArray>().elements;

        for(let load_path of load_paths) {
            let full_path = vmfs.join_paths(load_path.get_data<string>(), path);
            if (!assume_extension) full_path = `${full_path}.rb`;

            if (vmfs.is_file(full_path)) {
                return full_path;
            }
        }

        return null;
    };

    static register_native_extension(require_path: string, init_fn: () => void) {
        this.native_extensions[require_path] = { init_fn, inited: false };
    }

    static load_native_extension(require_path: string): boolean {
        const ext = this.native_extensions[require_path];

        if (ext.inited) {
            return false;
        } else {
            ext.inited = true;
            this.native_extensions[require_path].init_fn();
            return true;
        }
    }
}

Runtime.register_native_extension("rbconfig", rb_config_init);
Runtime.register_native_extension("stringio", stringio_init);
Runtime.register_native_extension("socket", socket_init);

export enum Visibility {
    public,
    private,
    protected
};

export abstract class Callable {
    public visibility: Visibility;

    abstract call(context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: CallData): RValue;
}

export class InterpretedCallable extends Callable {
    public name: string;
    public iseq: InstructionSequence;
    public nesting: RValue[];
    public owner?: RValue;

    constructor(name: string, iseq: InstructionSequence, visibility: Visibility, nesting: RValue[], owner?: RValue) {
        super();

        this.name = name;
        this.iseq = iseq;
        this.visibility = visibility;
        this.nesting = nesting;
        this.owner = owner;
    }

    call(context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue {
        call_data ||= MethodCallData.create(this.name, args.length);
        return context.run_method_frame(call_data, this.nesting, this.iseq, receiver, args, kwargs, block, this.owner);
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

    call(_context: ExecutionContext, receiver: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue {
        return this.method(receiver, args, kwargs, block, call_data);
    }
}

export class Module {
    public name: string | null;
    public singleton_class?: RValue;
    public nesting_parent?: RValue;
    public default_visibility: Visibility = Visibility.public;

    private constants_: {[key: string]: RValue};
    private deprecated_constants: {[key: string]: RValue};
    private methods_: {[key: string]: Callable};
    private removed_methods_: Set<string>;
    private undefined_methods_: Set<string>;
    private includes_: RValue[];
    private prepends_: RValue[];
    private autoloads_: Map<string, string>;

    private rval_: RValue;
    private name_rval_: RValue;

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

    define_method(name: string, body: InstructionSequence) {
        this.methods[name] = new InterpretedCallable(name, body, this.default_visibility, ExecutionContext.current.frame!.nesting, this.rval);
    }

    define_native_method(name: string, body: NativeMethod, visibility?: Visibility) {
        this.methods[name] = new NativeCallable(body, visibility, this);
    }

    define_singleton_method(name: string, body: InstructionSequence) {
        (this.get_singleton_class().get_data<Module>()).define_method(name, body);
    }

    define_native_singleton_method(name: string, body: NativeMethod) {
        (this.get_singleton_class().get_data<Module>()).define_native_method(name, body);
    }

    alias_method(new_name: string, existing_name: string) {
        const method = Object.find_instance_method_under(this.rval, existing_name, true);

        if (method) {
            this.methods[new_name] = method;
        } else {
            const type = this instanceof Class ? "class" : "module";
            throw new NameError(`undefined method \`${existing_name}' for ${type} \`${this.name}'`);
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
    find_constant(name: string): RValue | null {
        let constant = this.find_constant_in_self(name);
        if (constant) return constant;

        constant = this.find_constant_in_module_nesting(name);
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

    private find_constant_in_self(name: string): RValue | null {
        let constant = this.constants[name];
        if (constant) return constant;

        this.maybe_autoload_constant(name, this);
        constant = this.constants[name];
        if (constant) return constant;

        return null;
    }

    private find_constant_in_module_nesting(name: string): RValue | null {
        const ec = ExecutionContext.current;
        if (!ec || !ec.frame) return null;

        for (let i = ec.frame.nesting.length - 1; i >= 0; i --) {
            const current_mod_rval = ec.frame.nesting[i];
            const current_mod = current_mod_rval.get_data<Module>();
            let constant: RValue | null = current_mod.constants[name];
            if (constant) return constant;

            constant = this.maybe_autoload_constant(name, current_mod);
            if (constant) return constant;
        }

        return null;
    }

    private maybe_autoload_constant(name: string, mod: Module) : RValue | null {
        if (mod.autoloads.has(name)) {
            const file = mod.autoloads.get(name)!;
            mod.autoloads.delete(name);
            Runtime.require(file);
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

    private find_constant_in_ancestors(name: string): RValue | null {
        let constant: RValue | null = null;
        let parent_mod: Module | null = null;

        Runtime.each_unique_ancestor(this.rval, false, (ancestor: RValue): boolean => {
            if (ancestor.get_data<Module>().name === name) {
                constant = ancestor;
                return false;
            }

            parent_mod = ancestor.get_data<Module>();
            constant = parent_mod.constants[name];
            if (constant) return false;

            constant = this.maybe_autoload_constant(name, parent_mod);
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
            const singleton_klass = new Class(`Class:${this.name}`, ModuleClass);
            this.singleton_class = new RValue(ClassClass.klass, singleton_klass);
            singleton_klass.rval = this.singleton_class;
        }

        return this.singleton_class;
    }

    tap(cb: (mod: Module) => void) {
        cb(this);
    }

    inspect(): string {
        return `module ${this.name}`;
    }

    get name_rval(): RValue {
        if (!this.name) return Qnil;
        if (this.name_rval_) return this.name_rval_;
        this.name_rval_ = String.new(this.name);
        return this.name_rval_;
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
            let name = `#<Class:${this.klass.get_data<Class>().name}:${Object.object_id_to_str(this.object_id)}>`
            const klass = new Class(name, this.klass, true);
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

export class Class extends Module {
    public superclass: RValue | null;
    public is_singleton_class: boolean;

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

            const singleton_klass = new Class(`Class:${this.name}`, superclass_singleton, true);
            this.singleton_class = new RValue(ClassClass, singleton_klass);
            singleton_klass.rval = this.singleton_class;
        }

        return this.singleton_class;
    }

    tap(cb: (klass: Class) => void) {
        cb(this);
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
// export const StringClass      = object_class.constants["String"]      = new RValue(ClassClass, new Class("String", ObjectClass));
// export const ArrayClass       = object_class.constants["Array"]       = new RValue(ClassClass, new Class("Array", ObjectClass));
// export const HashClass        = object_class.constants["Hash"]        = new RValue(ClassClass, new Class("Hash", ObjectClass));
// export const NumericClass     = object_class.constants["Numeric"]     = new RValue(ClassClass, new Class("Numeric", ObjectClass));
// export const IntegerClass     = object_class.constants["Integer"]     = new RValue(ClassClass, new Class("Integer", NumericClass));
// export const FloatClass       = object_class.constants["Float"]       = new RValue(ClassClass, new Class("Float", NumericClass));
export const SymbolClass      = object_class.constants["Symbol"]      = new RValue(ClassClass, new Class("Symbol", ObjectClass));
export const ProcClass        = object_class.constants["Proc"]        = new RValue(ClassClass, new Class("Proc", ObjectClass));
export const NilClass         = object_class.constants["NilClass"]    = new RValue(ClassClass, new Class("NilClass", ObjectClass));
export const TrueClass        = object_class.constants["TrueClass"]   = new RValue(ClassClass, new Class("TrueClass", ObjectClass));
export const FalseClass       = object_class.constants["FalseClass"]  = new RValue(ClassClass, new Class("FalseClass", ObjectClass));
export const RegexpClass      = object_class.constants["Regexp"]      = new RValue(ClassClass, new Class("Regexp", ObjectClass));
export const KernelModule     = object_class.constants["Kernel"]      = new RValue(ModuleClass, new Module("Kernel"));

// Normally assigning rval is done by Runtime.define_class and friends, but since we have to
// construct RValues manually above, the rval property has to be set manually as well.
basic_object_class.rval = BasicObjectClass;
object_class.rval = ObjectClass;
module_class.rval = ModuleClass;
class_class.rval = ClassClass;
// StringClass.get_data<Class>().rval = StringClass;
// ArrayClass.get_data<Class>().rval = ArrayClass;
// HashClass.get_data<Class>().rval = HashClass;
// NumericClass.get_data<Class>().rval = NumericClass;
// IntegerClass.get_data<Class>().rval = IntegerClass;
// FloatClass.get_data<Class>().rval = FloatClass;
SymbolClass.get_data<Class>().rval = SymbolClass;
ProcClass.get_data<Class>().rval = ProcClass;
NilClass.get_data<Class>().rval = NilClass;
TrueClass.get_data<Class>().rval = TrueClass;
FalseClass.get_data<Class>().rval = FalseClass;
RegexpClass.get_data<Class>().rval = RegexpClass;
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
    klass.define_native_method("hash_merge_kwd", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("hash_merge_kwd is not implemented yet");
    });

    klass.define_native_method("hash_merge_ptr", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("hash_merge_ptr is not implemented yet");
    });

    klass.define_native_method("set_method_alias", (_self: RValue, args: RValue[]): RValue => {
        const klass = args[0].get_data<Class>();
        const new_name = args[1].get_data<string>();
        const old_name = args[2].get_data<string>();
        klass.alias_method(new_name, old_name);
        return Qnil;
    });

    klass.define_native_method("set_variable_alias", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("set_variable_alias is not implemented yet");
    });

    klass.define_native_method("set_postexe", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("set_postexe is not implemented yet");
    });

    klass.define_native_method("undef_method", (self: RValue, args: RValue[]): RValue => {
        throw new NotImplementedError("undef_method is not implemented yet");
    });

    klass.define_native_method("lambda", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue): RValue => {
        block!.get_data<Proc>().calling_convention = CallingConvention.METHOD_LAMBDA;
        return block!;
    });
});

export const VMCore = new RValue(VMCoreClass);

NilClass.get_data<Class>().tap( (klass: Class) => {
    klass.define_native_method("inspect", (_self: RValue): RValue => {
        return String.new("nil");
    });

    klass.define_native_method("to_i", (_self: RValue): RValue => {
        return Integer.get(0);
    });

    klass.define_native_method("to_s", (_self: RValue): RValue => {
        return String.new("");
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

TrueClass.get_data<Class>().tap( (klass: Class) => {
    klass.define_native_method("inspect", (_self: RValue): RValue => {
        return String.new("true");
    });

    klass.define_native_method("to_s", (_self: RValue): RValue => {
        return String.new("true");
    });

    klass.define_native_method("^", (_self: RValue, args: RValue[]): RValue => {
        return !args[0].is_truthy() ? Qtrue : Qfalse;
    });

    klass.define_native_method("!", (_self: RValue): RValue => {
        return Qfalse;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        if (!self.iv_exists("@__hash")) {
            self.iv_set("@__hash", Integer.get(obj_id_hash(self.object_id)));
        }

        return self.iv_get("@__hash");
    });

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return self === args[0] ? Qtrue : Qfalse;
    });
});

FalseClass.get_data<Class>().tap( (klass: Class) => {
    klass.define_native_method("inspect", (_self: RValue): RValue => {
        return String.new("false");
    });

    klass.define_native_method("to_s", (_self: RValue): RValue => {
        return String.new("false");
    });

    klass.define_native_method("^", (_self: RValue, args: RValue[]): RValue => {
        return !args[0].is_truthy() ? Qfalse : Qtrue;
    });

    klass.define_native_method("!", (_self: RValue): RValue => {
        return Qtrue;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        if (!self.iv_exists("@__hash")) {
            self.iv_set("@__hash", Integer.get(obj_id_hash(self.object_id)));
        }

        return self.iv_get("@__hash");
    });

    klass.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        return self === args[0] ? Qtrue : Qfalse;
    });
});

(ClassClass.get_data<Class>()).tap( (klass: Class) => {
    // create a new instance of the Class class, i.e. create a new user-defined class
    klass.define_native_singleton_method("new", (_self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const superclass = args[0] || ObjectClass;
        const new_class = new Class(null, superclass);
        const new_class_rval = new RValue(ClassClass, new_class);
        new_class.rval = new_class_rval;

        if (block) {
            block.get_data<Proc>().call(ExecutionContext.current, [new_class_rval]);
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
    klass.define_native_method("new", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue): RValue => {
        const obj = Object.send(self, "allocate");
        Object.send(obj, "initialize", args, kwargs, block);
        return obj;
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const klass = self.get_data<Class>();

        if (klass.name) {
            return String.new(klass.name);
        } else {
            // once we figure out how to call super(), replace this hackery
            return ObjectClass.get_data<Class>().methods["inspect"].call(
                ExecutionContext.current, self, []
            );
        }
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        const name = self.get_data<Class>().name;

        if (name) {
            return String.new(name);
        } else {
            return Object.send(self, "inspect");
        }
    });
});

(BasicObjectClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("initialize", (_self: RValue): RValue => {
        return Qnil;
    });

    klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
        return self.object_id == args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("equal?", (self: RValue, args: RValue[]): RValue => {
        return self.object_id == args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("!=", (self: RValue, args: RValue[]): RValue => {
        return self.object_id != args[0].object_id ? Qtrue : Qfalse;
    });

    klass.define_native_method("instance_exec", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue => {
        const proc = block!.get_data<Proc>();
        const binding = proc.binding.with_self(self);
        let block_call_data: BlockCallData | undefined = undefined;

        if (call_data) {
            block_call_data = BlockCallData.create(call_data.argc, call_data.flag, call_data.kw_arg);
        }

        return proc.with_binding(binding).call(ExecutionContext.current, args, kwargs, block_call_data);
    });

    klass.define_native_method("method_missing", (self: RValue, args: RValue[]): RValue => {
        // this is kinda broken until I can figure out how to inspect objects with cycles; for now,
        // just print out self's type

        // const inspect_str = Object.send(self, "inspect").get_data<string>();
        // throw new NoMethodError(`undefined method \`${method_name}' for ${inspect_str}`);
        const method_name = args[0].get_data<string>();
        throw new NoMethodError(`undefined method \`${method_name}' for ${self.klass.get_data<Class>().name}`);
    });

    klass.define_native_method("__send__", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue => {
        const method_name = Runtime.coerce_to_string(args[0]).get_data<string>();
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

        return Object.send(self, send_call_data, args, kwargs, block);
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

export const IOClass = Runtime.define_class("IO", ObjectClass, (klass: Class) => {
    klass.define_native_method("puts", (self: RValue, args: RValue[], _kwargs?: Kwargs, _block?: RValue, call_data?: MethodCallData): RValue => {
        const io = self.get_data<IO>();

        for (const arg of args) {
            if (arg.klass === RubyArray.klass && call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
                for (const elem of arg.get_data<RubyArray>().elements) {
                    io.puts(Object.send(elem, "to_s").get_data<string>());
                }
            } else {
                io.puts(Object.send(arg, "to_s").get_data<string>());
            }
        }

        return Qnil;
    });

    klass.define_native_method("write", (self: RValue, args: RValue[], _kwargs?: Kwargs, _block?: RValue, call_data?: MethodCallData): RValue => {
        const io = self.get_data<IO>();

        for (const arg of args) {
            if (arg.klass === RubyArray.klass && call_data?.has_flag(CallDataFlag.ARGS_SPLAT)) {
                for (const elem of arg.get_data<RubyArray>().elements) {
                    io.write(Object.send(elem, "to_s").get_data<string>());
                }
            } else {
                io.write(Object.send(arg, "to_s").get_data<string>());
            }
        }

        return Qnil;
    });

    klass.alias_method("print", "write");

    klass.define_native_method("flush", (self: RValue): RValue => {
        // @TODO: what needs to be done here?
        return self;
    });

    klass.define_native_method("isatty", (self: RValue): RValue => {
        return self.get_data<IO>().is_tty() ? Qtrue : Qfalse;
    });

    klass.alias_method("tty?", "isatty");
});

export const STDOUT = ObjectClass.get_data<Class>().constants["STDOUT"] = is_node ? NodeIO.new(process.stdout) : BrowserIO.new(console.log);
export const STDERR = ObjectClass.get_data<Class>().constants["STDERR"] = is_node ? NodeIO.new(process.stderr) : BrowserIO.new(console.error);

export const init = async () => {
    module_init();
    string_init();
    comparable_init();
    numeric_init();
    rational_init();
    integer_init();
    float_init();
    symbol_init();
    enumerable_init();
    hash_init();
    proc_init();
    error_init();
    process_init();
    env_init();
    file_init();
    dir_init();
    await kernel_init();
    object_init();
    range_init();
    binding_init();
    signal_init();
    time_init();
    thread_init();
    await regexp_init();
    encoding_init();
    array_init();
    struct_init();

    ObjectClass.get_data<Class>().constants["RUBY_PLATFORM"] = await (async () => {
        if (is_node) {
            let arch: string = process.arch;
            if (arch === "x64") arch = "x86_64";

            const platform = process.platform;
            // const release = (await import("os")).release().split(".")[0];
            const release = "foo";

            return String.new(`${arch}-${platform}${release}`);
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

            return String.new(`${browser}-${platform}`);
        }
    })();

    ObjectClass.get_data<Class>().constants["RUBY_VERSION"] = String.new("3.2.2");
    ObjectClass.get_data<Class>().constants["RUBY_ENGINE"] = String.new("Garnet.js");

    ObjectClass.get_data<Class>().constants["RUBY_DESCRIPTION"] = String.new(
        `Garnet.js ${ObjectClass.get_data<Class>().constants["RUBY_VERSION"].get_data<string>()} [${ObjectClass.get_data<Class>().constants["RUBY_PLATFORM"].get_data<string>()}]`
    );

    if (is_node) {
        Dir.setwd(process.env.PWD!);
    } else {
        Dir.setwd(vmfs.root_path());
    }
}
