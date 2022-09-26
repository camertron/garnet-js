import { InstructionSequence } from "./instruction_sequence";
import { NoMethodError } from "./errors";
import { ExecutionContext } from "./execution_context";

type ModuleDefinitionCallback = (module: Module) => void;
type ClassDefinitionCallback = (klass: Class) => void;

export type NativeMethod = (self: RValue, ...args: RValue[]) => RValue;

// used as the type for keys of the symbols weak map
type SymbolType = {
    name: string
}

// Runtime is abstract so it can't be instantiated
export abstract class Runtime {
    static constants: {[key: string]: RValue} = {};
    static symbols: WeakMap<SymbolType, RValue> = new WeakMap();

    static define_module(name: string, cb?: ModuleDefinitionCallback): RValue {
        if (!this.constants[name]) {
            const module = new RValue(ModuleClass.get_data<Class>(), new Module(name));
            this.constants[name] = module;
        }

        if (cb) {
            cb(this.constants[name].get_data<Module>());
        }

        return this.constants[name];
    }

    static define_module_under(parent: Module, name: string, cb?: ModuleDefinitionCallback): RValue {
        if (!parent.constants[name]) {
            const module = new RValue(ModuleClass.get_data<Class>(), new Module(name, parent));
            parent.constants[name] = module;
        }

        if (cb) {
            cb(parent.constants[name].get_data<Module>());
        }

        return parent.constants[name];
    }

    static define_class(name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        if (!this.constants[name]) {
            if (superclass == Qnil) {
                superclass = ObjectClass;
            }

            const klass_val = new RValue(ClassClass.get_data<Class>(), new Class(name, superclass.get_data<Class>()));
            this.constants[name] = klass_val;
        }

        if (cb) {
            cb(this.constants[name].get_data<Class>());
        }

        return this.constants[name];
    }

    static define_class_under(parent: RValue, name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        const parent_mod = parent.get_data<Module>();

        if (!parent_mod.constants[name]) {
            if (superclass == Qnil) {
                superclass = ObjectClass;
            }

            const klass_val = new RValue(ClassClass.get_data<Class>(), new Class(name, superclass.get_data<Class>(), parent_mod));
            parent_mod.constants[name] = klass_val;
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
    // have to incur the overhead of making a bunch of new RValue strings all over the place.
    static intern(value: string): RValue {
        const key = {name: value};
        let symbol = this.symbols.get(key);

        if (!symbol) {
            symbol = new RValue(SymbolClass.get_data<Class>(), value);
            this.symbols.set(key, symbol);
        }

        return symbol;
    }

    static each_unique_ancestor(mod: Module, cb: (ancestor: Module) => boolean) {
        const seen: Set<Module> = new Set();

        mod.each_ancestor( (ancestor: Module): boolean => {
            if (!seen.has(ancestor)) {
                seen.add(ancestor);
                return cb(ancestor);
            }

            return true;
        });
    }
}

export interface Callable {
    call(context: ExecutionContext, receiver: RValue, args: RValue[], block?: RValue): RValue;
}

export class InterpretedCallable implements Callable {
    private iseq: InstructionSequence;

    constructor(iseq: InstructionSequence) {
        this.iseq = iseq;
    }

    call(context: ExecutionContext, receiver: RValue, args: RValue[], block?: RValue): RValue {
        context.evaluate(receiver, this.iseq, () => {
            const current_frame = context.current_frame();

            args.forEach( (arg: RValue, index: number) => {
                current_frame.set_local(index, arg);
            });

            if (block) {
                current_frame.set_block(block);
            }
        });

        return context.stack[context.stack.length - 1];
    }
}

export class NativeCallable implements Callable {
    private method: NativeMethod;

    constructor(method: NativeMethod) {
        this.method = method;
    }

    call(context: ExecutionContext, receiver: RValue, args: RValue[], _block?: RValue): RValue {
        return this.method(receiver, ...args);
    }
}

export class Module {
    public name: string | null;
    public constants: {[key: string]: RValue};
    public methods: {[key: string]: Callable};
    public includes: Module[];
    public prepends: Module[];
    public singleton_class?: RValue;
    public nesting_parent?: Module;

    constructor(name: string | null, nesting_parent?: Module) {
        this.name = name;
        this.nesting_parent = nesting_parent;
        this.constants = {};
        this.methods = {};
        this.includes = [];
        this.prepends = [];
    }

    define_method(name: string, body: InstructionSequence) {
        this.methods[name] = new InterpretedCallable(body);
    }

    define_native_method(name: string, body: NativeMethod) {
        this.methods[name] = new NativeCallable(body);
    }

    define_singleton_method(name: string, body: InstructionSequence) {
        (this.get_singleton_class().get_data<Class>()).define_method(name, body);
    }

    define_native_singleton_method(name: string, body: NativeMethod) {
        (this.get_singleton_class().get_data<Class>()).define_native_method(name, body);
    }

    alias_method(new_name: string, existing_name: string) {
        this.methods[new_name] = this.methods[existing_name];
    }

    find_constant(name: string): RValue | null {
        let current_mod: Module | undefined = this;

        while (current_mod) {
            const constant = current_mod.constants[name];

            if (constant) {
                return constant;
            }

            current_mod = current_mod.nesting_parent;
        }

        return Runtime.constants[name];
    }

    include(mod: Module) {
        this.includes.push(mod);
    }

    extend(mod: Module) {
        (this.get_singleton_class().get_data<Class>()).include(mod);
    }

    prepend(mod: Module) {
        this.prepends.push(mod);
    }

    get_singleton_class(): RValue {
        if (!this.singleton_class) {
            const singleton_klass = new Class(`Class:${this.name}`, ObjectClass.get_data<Class>());
            this.singleton_class = new RValue(ClassClass.klass, singleton_klass);
        }

        return this.singleton_class;
    }

    // Return false from cb() to exit early. Returning false from cb() will cause
    // each_ancestor to return false as well; otherwise it will return true.
    each_ancestor(cb: (ancestor: Module) => boolean): boolean {
        for (let prepended_module of this.prepends) {
            if (!cb(prepended_module)) {
                return false;
            }
        }

        if (!cb(this)) {
            return false;
        }

        for (let included_module of this.includes) {
            if (!cb(included_module)) {
                return false;
            }
        }

        return true;
    }

    tap(cb: (mod: Module) => void) {
        cb(this);
    }
}

let next_object_id = 0;

export class RValue {
    public klass: Class;
    public ivars: {[key: string]: RValue};
    public data: any;
    public object_id: number;

    constructor(klass: Class, data?: any) {
        this.klass = klass;
        this.ivars = {};
        this.data = data;
        this.object_id = next_object_id;
        next_object_id ++;
    }

    assert_type(type: Module): void;
    assert_type(type: RValue): void;
    assert_type(type: Module | RValue) {
        const module = (() => {
            if (type instanceof Module) {
                return type;
            } else {
                return type.get_data<Class>();
            }
        })();

        if (this.klass != module) {
            throw new TypeError(`no implicit conversion of ${module.name} into ${this.klass.name}`);
        }
    }

    get_data<T>(): T {
        return this.data as T;
    }
}

export class Class extends Module {
    public superclass: Class | null;

    // name: can be null in the case of an anonymous class.
    // superclass: can be null in the case of BasicObject. Should always be provided otherwise.
    constructor(name: string | null, superclass: Class | null, nesting_parent?: Module) {
        super(name, nesting_parent);

        this.superclass = superclass;
    }

    // Return false from cb() to exit early. Returning false from cb() will cause
    // each_ancestor to return false as well.
    override each_ancestor(cb: (ancestor: Module) => boolean): boolean {
        if (!super.each_ancestor(cb)) {
            return false;
        }

        if (this.superclass) {
            if (!cb(this.superclass)) {
                return false;
            }

            if (!this.superclass?.each_ancestor(cb)) {
                return false;
            }
        }

        return true;
    }

    get_singleton_class(): RValue {
        if (!this.singleton_class) {
            let superclass_singleton = null;

            if (this.superclass) {
                superclass_singleton = this.superclass.get_singleton_class().get_data<Class>();
            } else if (this != BasicObjectClass.get_data<Class>()) {
                // Make sure this class isn't Object so we avoid an infinite loop
                // Also make sure this class isn't Module, which has no superclass
                superclass_singleton = ObjectClass.get_data<Class>().get_singleton_class().get_data<Class>();
            }

            const singleton_klass = new Class(`Class:${this.name}`, superclass_singleton);
            this.singleton_class = new RValue(ClassClass.get_data<Class>(), singleton_klass);
        }

        return this.singleton_class;
    }

    tap(cb: (klass: Class) => void) {
        cb(this);
    }
}

// an RValue that wraps Runtime
const ConstBase = new RValue(new Class("ConstBase", null), Runtime);
export { ConstBase };

const basic_object_class = new Class("BasicObject", null);
const object_class = new Class("Object", basic_object_class);
const module_class = new Class("Module", object_class);
const class_class = new Class("Class", module_class);

export const ModuleClass      = Runtime.constants["Module"]      = new RValue(class_class, module_class);
export const ClassClass       = Runtime.constants["Class"]       = new RValue(class_class, class_class);
export const BasicObjectClass = Runtime.constants["BasicObject"] = new RValue(class_class, basic_object_class);
export const ObjectClass      = Runtime.constants["Object"]      = new RValue(class_class, object_class);
export const StringClass      = Runtime.constants["String"]      = new RValue(class_class, new Class("String", object_class));
export const ArrayClass       = Runtime.constants["Array"]       = new RValue(class_class, new Class("Array", object_class));
export const IntegerClass     = Runtime.constants["Integer"]     = new RValue(class_class, new Class("Integer", object_class));
export const SymbolClass      = Runtime.constants["Symbol"]      = new RValue(class_class, new Class("Symbol", object_class));
export const NilClass         = Runtime.constants["NilClass"]    = new RValue(class_class, new Class("NilClass", object_class));
export const TrueClass        = Runtime.constants["TrueClass"]   = new RValue(class_class, new Class("TrueClass", object_class));
export const FalseClass       = Runtime.constants["FalseClass"]  = new RValue(class_class, new Class("FalseClass", object_class));
export const KernelModule     = Runtime.constants["Kernel"]      = new RValue(ModuleClass.get_data<Class>(), new Module("Kernel"));

let kernel_puts = (_self: RValue, ...args: RValue[]): RValue => {
    for (let arg of args) {
        // @TODO: call to_s instead of checking for string values
        arg.assert_type(StringClass)
        console.log(arg.data);
    }

    return Qnil;
};

(KernelModule.get_data<Module>()).tap( (mod: Module) => {
    mod.define_native_method("puts", kernel_puts);
    mod.define_native_singleton_method("puts", kernel_puts);
});

(ModuleClass.get_data<Module>()).tap( (mod: Module) => {
    mod.define_native_method("inspect", (self: RValue): RValue => {
        const mod = self.get_data<Module>();

        if (mod.name) {
            return String.new(mod.name);
        } else {
            return String.new(`#<Module:${Object.object_id_to_str(self.object_id)}>`);
        }
    });

    mod.define_native_method("ancestors", (self: RValue): RValue => {
        const mod = self.get_data<Module>();
        const result: RValue[] = [];

        Runtime.each_unique_ancestor(self.get_data<Module>(), (ancestor: Module): boolean => {
            result.push(mod.find_constant(ancestor.name!)!);
            return true;
        });

        return Array.new(result);
    });
});

export const Qnil = new RValue(NilClass.get_data<Class>(), null);
export const Qtrue = new RValue(TrueClass.get_data<Class>(), true);
export const Qfalse = new RValue(FalseClass.get_data<Class>(), false);

export abstract class String {
    static new(str: string): RValue {
        return new RValue(StringClass.get_data<Class>(), str);
    }
}

export abstract class Object {
    static send(self: RValue, method_name: string, ...args: RValue[]): RValue {
        let method = null;

        if (self.klass == ClassClass.get_data<Class>()) {
            method = Object.find_method_under(self.get_data<Class>().get_singleton_class().klass, method_name);
        } else {
            method = Object.find_method_under(self.klass, method_name);
        }

        if (method) {
            return method.call(ExecutionContext.current, self, args);
        } else {
            const inspect_str = Object.send(self, "inspect").get_data<string>();
            throw new NoMethodError(`undefined method \`${method_name}' for ${inspect_str}`)
        }
    }

    private static find_method_under(mod: Module, method_name: string): Callable | null {
        let found_method = null;

        Runtime.each_unique_ancestor(mod, (ancestor: Module): boolean => {
            const method = ancestor.methods[method_name];

            if (method) {
                found_method = method;
                return false; // exit early from each_unique_ancestor()
            }

            return true;
        });

        return found_method;
    }

    static object_id_to_str(object_id: number): string {
        const id_str = object_id.toString(16).padStart(16, "0");
        return `0x${id_str}`;
    }
}

(ClassClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_singleton_method("allocate", (self: RValue): RValue => {
        return new RValue(self.get_data<Class>());
    });

    klass.define_native_singleton_method("new", (self: RValue): RValue => {
        const obj = Object.send(self, "allocate");
        Object.send(obj, "initialize");
        return obj;
    });

    klass.define_native_method("initialize", (_self: RValue): RValue => {
        return Qnil;
    });
});

(ObjectClass.get_data<Class>()).tap( (klass: Class) => {
    klass.include(KernelModule.get_data<Module>());

    // NOTE: send should actually be defined by the Kernel module
    klass.define_native_singleton_method("send", (self: RValue, method_name: RValue, ...args: RValue[]): RValue => {
        method_name.assert_type(StringClass);
        return Object.send(self.klass.get_singleton_class(), method_name.get_data<string>(), ...args);
    });

    klass.define_native_method("send", (self: RValue, method_name: RValue, ...args: RValue[]) => {
        method_name.assert_type(StringClass);
        return Object.send(self, method_name.get_data<string>(), ...args);
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const name = self.klass.name ? self.klass.name : "Class";
        let parts = [`${name}:${Object.object_id_to_str(self.object_id)}`];

        for (let ivar_name in self.ivars) {
            const ivar = self.ivars[ivar_name];
            const inspect_str = Object.send(ivar, "inspect").get_data<string>();
            parts.push(`${ivar_name}=${inspect_str}`)
        }

        return String.new(`#<${parts.join(" ")}>`)
    });

    klass.alias_method("to_s", "inspect");
});

const each_codepoint = function*(str: string) {
    for (let byteIndex = 0; byteIndex < str.length; byteIndex ++) {
        const code = str.charCodeAt(byteIndex);

        if (0xd800 <= code && code <= 0xdbff) {
            const hi = code;
            byteIndex ++;
            const low = str.charCodeAt(byteIndex);
            yield (hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        } else {
            yield code;
        }
    }
};

const hash_string = (str: string): number => {
    let h = 0;

    for(let cp of each_codepoint(str)) {
        h = Math.imul(31, h) + cp | 0;
    }

    return h;
}

(StringClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, str?: RValue): RValue => {
        if (str) {
            self.data = str.data;
        }

        return Qnil;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        return self;
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        return String.new(`"${str.replace(/\"/g, "\\\"")}"`);
    });
});

export abstract class Integer {
    static new(value: number): RValue {
        return new RValue(IntegerClass.get_data<Class>(), value);
    }
}

(IntegerClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        return String.new(self.get_data<number>().toString());
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        // Ruby hashes the object ID for fixnums. We should eventually do the same.
        // https://github.com/ruby/ruby/blob/6e46bf1e54e7fe83dc80e49394d980b71321b6f0/hash.c#L171
        return self;
    });
});

export const INT2FIX0 = new RValue(IntegerClass.get_data<Class>(), 0);
export const INT2FIX1 = new RValue(IntegerClass.get_data<Class>(), 1);

(SymbolClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        const quote = !/^\w+$/.test(str);
        const escaped_str = str.replace(/\"/g, "\\\"");

        return String.new(quote ? `:"${escaped_str}"` : `:${escaped_str}`);
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });
});

type ConsoleFn = (...data: any[]) => void;

export class IO {
    // this is all kinds of wrong but it's fine for now
    static new(console_fn: ConsoleFn): RValue {
        return new RValue(IOClass.get_data<Class>(), new IO(console_fn));
    }

    private console_fn: ConsoleFn;

    constructor(console_fn: ConsoleFn) {
        this.console_fn = console_fn;
    }

    puts(val: any) {
        this.console_fn(val);
    }
}

export const IOClass = Runtime.define_class("IO", ObjectClass, (klass: Class) => {
    klass.define_native_method("puts", (self: RValue, val: RValue): RValue => {
        const io = self.get_data<IO>();
        io.puts(Object.send(val, "to_s").get_data<string>());
        return Qnil;
    })
});

export const STDOUT = Runtime.constants["STDOUT"] = IO.new(console.log);
export const STDERR = Runtime.constants["STDERR"] = IO.new(console.error);

export abstract class Array {
    static new(arr?: RValue[]): RValue {
        return new RValue(ArrayClass.get_data<Class>(), arr || []);
    }
}

(ArrayClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        const elements = self.get_data<RValue[]>();

        const strings = elements.map( (element: RValue): string => {
            return Object.send(element, "inspect").get_data<string>();
        });

        return String.new(`[${strings.join(", ")}]`);
    })
});
