import { Class, Module, ObjectClass, RValue, Runtime, String } from "./runtime";

export const init = () => {
    const ExceptionClass = Runtime.define_class("Exception", ObjectClass, (klass: Class) => {
        klass.define_native_method("message", (self: RValue): RValue => {
            if (!self.iv_exists("message")) {
                self.iv_set("message", String.new(self.get_data<Error>().message));
            }

            return self.iv_get("message");
        });
    });

    const StandardErrorClass = Runtime.define_class("StandardError", ExceptionClass);
    const TypeErrorClass = Runtime.define_class("TypeError", StandardErrorClass);
    const NameErrorClass = Runtime.define_class("NameError", StandardErrorClass);
    const LocalJumpErrorClass = Runtime.define_class("LocalJumpError", StandardErrorClass);
    const RuntimeErrorClass = Runtime.define_class("RuntimeError", StandardErrorClass);
    const NoMethodErrorClass = Runtime.define_class("NoMethodError", NameErrorClass);
    const ArgumentErrorClass = Runtime.define_class("NoMethodError", StandardErrorClass);

    const ScriptErrorClass = Runtime.define_class("ScriptError", ExceptionClass);
    const SyntaxErrorClass = Runtime.define_class("SyntaxError", ScriptErrorClass);
    const LoadErrorClass = Runtime.define_class("LoadError", ScriptErrorClass);
    const NotImplementedErrorClass = Runtime.define_class("NoMethodError", ScriptErrorClass);

    const SystemCallErrorClass = Runtime.define_class("SystemCallError", StandardErrorClass);
    const ErrnoModule = Runtime.define_module("Errno");
    const ErrnoENOENTClass = Runtime.define_class_under(ErrnoModule, "ENOENT", SystemCallErrorClass);
}

export abstract class RubyError extends Error {
    private rvalue: RValue;
    public backtrace: string[];

    to_rvalue(): RValue {
        this.rvalue ||= new RValue(this.ruby_class, this);
        return this.rvalue;
    }

    abstract get ruby_class(): RValue;
}

export class StandardError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }

    get ruby_class(): RValue {
        return StandardError.ruby_class ||= Runtime.constants["StandardError"];
    }
}

export class NotImplementedError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }

    get ruby_class(): RValue {
        return NotImplementedError.ruby_class ||= Runtime.constants["NotImplementedError"];
    }
}

export class NameError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NameError";
    }

    get ruby_class(): RValue {
        return NameError.ruby_class ||= Runtime.constants["NameError"];
    }
}

export class LocalJumpError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LocalJumpError";
    }

    get ruby_class(): RValue {
        return LocalJumpError.ruby_class ||= Runtime.constants["LocalJumpError"];
    }
}

export class NoMethodError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NoMethodError";
    }

    get ruby_class(): RValue {
        return NoMethodError.ruby_class ||= Runtime.constants["NoMethodError"];;
    }
}

export class ArgumentError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ArgumentErrorClass";
    }

    get ruby_class(): RValue {
        return ArgumentError.ruby_class ||= Runtime.constants["ArgumentError"];
    }
}

export class TypeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "TypeError";
    }

    get ruby_class(): RValue {
        return TypeError.ruby_class ||= Runtime.constants["TypeError"];
    }
}

export class LoadError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LoadError";
    }

    get ruby_class(): RValue {
        return LoadError.ruby_class ||= Runtime.constants["LoadError"];
    }
}

export class RuntimeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RuntimeError";
    }

    get ruby_class(): RValue {
        return RuntimeError.ruby_class ||= Runtime.constants["RuntimeError"];
    }
}

export class SyntaxError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "SyntaxError";
    }

    get ruby_class(): RValue {
        return SyntaxError.ruby_class ||= Runtime.constants["SyntaxError"];
    }
}

export class ErrnoENOENT extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ENOENT";
    }

    get ruby_class() {
        return ErrnoENOENT.ruby_class ||= Runtime.constants["Errno"].get_data<Module>().constants["ENOENT"];
    }
}
