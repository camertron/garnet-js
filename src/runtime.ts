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
            const module = Object.send(ModuleClass.klass.get_singleton_class(), String.new("new"));
            this.constants[name] = module;
        }

        if (cb) {
            cb(this.constants[name].klass);
        }

        return this.constants[name];
    }

    static define_module_under(parent: Module, name: string, cb?: ModuleDefinitionCallback): RValue {
        if (!parent.constants[name]) {
            const module = Object.send(ModuleClass.klass.get_singleton_class(), String.new("new"));
            parent.constants[name] = module;
        }

        if (cb) {
            cb(parent.constants[name].klass);
        }

        return parent.constants[name];
    }

    static define_class(name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        if (!this.constants[name]) {
            const klass_val = new RValue(ClassClass.klass, new Class(name, superclass.klass));
            this.constants[name] = klass_val;
        }

        if (cb) {
            cb(this.constants[name].klass);
        }

        return this.constants[name];
    }

    static define_class_under(parent: RValue, name: string, superclass: RValue, cb?: ClassDefinitionCallback): RValue {
        if (!parent.klass.constants[name]) {
            const klass_val = new RValue(ClassClass.klass, new Class(name, superclass.klass));
            klass_val.klass.name = name;
            parent.klass.constants[name] = klass_val;
        }

        if (cb) {
            cb(parent.klass.constants[name].klass);
        }

        return parent.klass.constants[name];
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

    call(context: ExecutionContext, _receiver: RValue, args: RValue[], block?: RValue): RValue {
        context.evaluate(this.iseq, () => {
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

    call(_context: ExecutionContext, receiver: RValue, args: RValue[], _block?: RValue): RValue {
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
        this.get_singleton_class().klass.define_method(name, body);
    }

    define_native_singleton_method(name: string, body: NativeMethod) {
        this.get_singleton_class().klass.define_native_method(name, body);
    }

    include(mod: Module) {
        this.includes.push(mod);
    }

    extend(mod: Module) {
        this.get_singleton_class().klass.include(mod);
    }

    prepend(mod: Module) {
        this.prepends.push(mod);
    }

    get_singleton_class(): RValue {
        if (!this.singleton_class) {
            const singleton_klass = new Class(`Class:${this.name}`, ObjectClass.klass);
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
                return type.klass;
            }
        })();

        if (this.klass != module) {
            throw new TypeError(`no implicit conversion of ${module.name} into ${this.klass.name}`);
        }
    }
}

export class Class extends Module {
    private superclass: Class | null;

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
}

export const BasicObjectClass = new RValue(new Class("BasicObject", null));
export const ObjectClass      = new RValue(new Class("Object", BasicObjectClass.klass));
export const ClassClass       = new RValue(new Class("Class", ObjectClass.klass));
export const ModuleClass      = new RValue(new Class("Module", ObjectClass.klass));
export const NilClass         = new RValue(new Class("NilClass", ObjectClass.klass));
export const StringClass      = new RValue(new Class("String", ObjectClass.klass));

// @TODO: figure out how to wrap this in an RValue, which only accept classes
export const KernelModule     = new RValue(ModuleClass.klass, new Module("Kernel"));

let kernel_puts = (_self: RValue, ...args: RValue[]): RValue => {
    for (let arg of args) {
        // @TODO: call to_s instead of checking for string values
        arg.assert_type(StringClass)
        console.log(arg.data);
    }

    return Qnil;
};

KernelModule.klass.define_native_method("puts", kernel_puts);
KernelModule.klass.define_native_singleton_method("puts", kernel_puts);

ObjectClass.klass.include(KernelModule.data as Module);

ModuleClass.klass.define_native_singleton_method("inspect", (self: RValue): RValue => {
    const mod = self.data as Module;

    if (mod.name) {
        return String.new(mod.name);
    } else {
        return String.new(`#<Module:${Object.object_id_to_str(self.object_id)}>`);
    }
});

export const Qnil = new RValue(NilClass.klass);

export abstract class String {
    static new(str: string): RValue {
        return new RValue(StringClass.klass, str);
    }
}

export abstract class Object {
    static send(self: RValue, method_name: RValue, ...args: RValue[]): RValue {
        method_name.assert_type(StringClass);

        const method = Object.find_method_under(self.klass, method_name.data as string);

        if (method) {
            return method.call(ExecutionContext.current, self, args);
        } else {
            const inspect_str = Object.send(self, String.new("inspect")).data as string;
            throw new NoMethodError(`undefined method \`${method_name.data as string}' for ${inspect_str}`)
        }
    }

    private static find_method_under(mod: Module, method_name: string): Callable | null {
        // @TODO figure out a way to dispatch iseq methods too
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

ClassClass.klass.define_native_singleton_method("allocate", (self: RValue): RValue => {
    return new RValue(self.klass);
});

ClassClass.klass.define_native_singleton_method("new", (self: RValue): RValue => {
    const obj = Object.send(self.klass.get_singleton_class(), String.new("allocate"));
    Object.send(obj, String.new("initialize"));
    return obj;
});

ClassClass.klass.define_native_method("initialize", (_self: RValue): RValue => {
    return Qnil;
});

// NOTE: send should actually be defined by the Kernel module
ObjectClass.klass.define_native_singleton_method("send", (self: RValue, method_name: RValue, ...args: RValue[]): RValue => {
    return Object.send(self.klass.get_singleton_class(), method_name, ...args);
});

ObjectClass.klass.define_native_method("send", (self: RValue, method_name: RValue, ...args: RValue[]) => {
    return Object.send(self, method_name, ...args);
});

ObjectClass.klass.define_native_method("inspect", (self: RValue): RValue => {
    const name = self.klass.name ? self.klass.name : "Class";
    let parts = [`${name}:${Object.object_id_to_str(self.object_id)}`];

    for (let ivar_name in self.ivars) {
        const ivar = self.ivars[ivar_name];
        const inspect_str = Object.send(ivar, String.new("inspect")).data as string;
        parts.push(`${ivar_name}=${inspect_str}`)
    }

    return String.new(`#<${parts.join(" ")}>`)
});

StringClass.klass.define_native_method("initialize", (self: RValue, str?: RValue): RValue => {
    if (str) {
        self.data = str.data;
    }

    return Qnil;
});
