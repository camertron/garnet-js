import { InstructionSequence } from "./instruction_sequence";
import { NoMethodError } from "./errors";
import ExecutionContext from "./execution_context";

type ModuleDefinitionCallback = (module: Module) => void;
type ClassDefinitionCallback = (klass: Class) => void;

export type NativeMethod = (self: RValue, ...args: RValue[]) => RValue;

// Runtime is abstract so it can't be instantiated
export abstract class Runtime {
    static constants: {[key: string]: RValue} = {};

    static define_module(name: string, cb?: ModuleDefinitionCallback): RValue {
        if (!this.constants[name]) {
            const module = Object.send((ModuleClass.get_data<Module>()).get_singleton_class(), String.new("new"));
            this.constants[name] = module;
        }

        if (cb) {
            cb(this.constants[name].klass);
        }

        return this.constants[name];
    }

    static define_module_under(parent: Module, name: string, cb?: ModuleDefinitionCallback): RValue {
        if (!parent.constants[name]) {
            const module = Object.send((ModuleClass.get_data<Module>()).get_singleton_class(), String.new("new"));
            parent.constants[name] = module;
        }

        if (cb) {
            cb(parent.constants[name].klass);
        }

        return parent.constants[name];
    }

    static define_class(name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        if (!this.constants[name]) {
            const klass_val = new RValue(ClassClass.get_data<Class>(), new Class(name, superclass.get_data<Class>()));
            this.constants[name] = klass_val;
        }

        if (cb) {
            cb(this.constants[name].klass);
        }

        return this.constants[name];
    }

    static define_class_under(parent: RValue, name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        const parent_mod = parent.get_data<Module>();

        if (!parent_mod.constants[name]) {
            const klass_val = new RValue(ClassClass.get_data<Class>(), new Class(name, superclass.get_data<Class>()));
            parent_mod.constants[name] = klass_val;
        }

        if (cb) {
            cb(parent_mod.constants[name].klass);
        }

        return parent_mod.constants[name];
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
        const result = this.method(receiver, ...args);
        context.stack.push(result);
        return result;
    }
}

export class Module {
    public name: string | null;
    public constants: {[key: string]: RValue};
    public methods: {[key: string]: Callable};
    public includes: Module[];
    public prepends: Module[];
    public singleton_class?: RValue;

    constructor(name: string | null) {
        this.name = name;
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
    constructor(name: string | null, superclass: Class | null) {
        super(name);

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

const class_class = new Class("Class", null);

export const ModuleClass      = Runtime.constants["Module"]      = new RValue(class_class, new Class("Module", null));
export const ClassClass       = Runtime.constants["Class"]       = new RValue(class_class, new Class("Class", ModuleClass.get_data<Class>()));
export const BasicObjectClass = Runtime.constants["BasicObject"] = new RValue(class_class, new Class("BasicObject", ClassClass.get_data<Class>()));
export const ObjectClass      = Runtime.constants["Object"]      = new RValue(class_class, new Class("Object", BasicObjectClass.get_data<Class>()));
export const StringClass      = Runtime.constants["String"]      = new RValue(class_class, new Class("String", ObjectClass.get_data<Class>()));
export const NilClass         = Runtime.constants["NilClass"]    = new RValue(class_class, new Class("NilClass", ObjectClass.get_data<Class>()));
export const TrueClass        = Runtime.constants["TrueClass"]   = new RValue(class_class, new Class("TrueClass", ObjectClass.get_data<Class>()));
export const FalseClass       = Runtime.constants["FalseClass"]  = new RValue(class_class, new Class("FalseClass", ObjectClass.get_data<Class>()));
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
    mod.define_native_singleton_method("inspect", (self: RValue): RValue => {
        const mod = self.get_data<Module>();

        if (mod.name) {
            return String.new(mod.name);
        } else {
            return String.new(`#<Module:${Object.object_id_to_str(self.object_id)}>`);
        }
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
    static send(self: RValue, method_name: RValue, ...args: RValue[]): RValue {
        method_name.assert_type(StringClass);

        let method = null;

        if (self.klass == ClassClass.get_data<Class>()) {
            method = Object.find_method_under((self.get_data<Class>()).get_singleton_class().get_data<Class>(), method_name.get_data<string>());
        } else {
            method = Object.find_method_under(self.klass, method_name.get_data<string>());
        }

        if (method) {
            return method.call(ExecutionContext.current, self, args);
        } else {
            const inspect_str = Object.send(self, String.new("inspect")).get_data<string>();
            throw new NoMethodError(`undefined method \`${method_name.get_data<string>()}' for ${inspect_str}`)
        }
    }

    private static find_method_under(mod: Module, method_name: string): Callable | null {
        let found_method = null;

        mod.each_ancestor( (ancestor: Module): boolean => {
            const method = ancestor.methods[method_name];

            if (method) {
                found_method = method;
                return false; // exit early from each_ancestor()
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
        const obj = Object.send(self, String.new("allocate"));
        Object.send(obj, String.new("initialize"));
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
        return Object.send(self.klass.get_singleton_class(), method_name, ...args);
    });

    klass.define_native_method("send", (self: RValue, method_name: RValue, ...args: RValue[]) => {
        return Object.send(self, method_name, ...args);
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const name = self.klass.name ? self.klass.name : "Class";
        let parts = [`${name}:${Object.object_id_to_str(self.object_id)}`];

        for (let ivar_name in self.ivars) {
            const ivar = self.ivars[ivar_name];
            const inspect_str = Object.send(ivar, String.new("inspect")).get_data<string>();
            parts.push(`${ivar_name}=${inspect_str}`)
        }

        return String.new(`#<${parts.join(" ")}>`)
    });
});

(StringClass.get_data<Class>()).tap( (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, str?: RValue): RValue => {
        if (str) {
            self.data = str.data;
        }

        return Qnil;
    });
});
