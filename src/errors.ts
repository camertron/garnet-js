import { Class, ObjectClass, RValue, Runtime, String } from "./runtime";

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

const ScriptErrorClass = Runtime.define_class("ScriptError", ExceptionClass);
const LoadErrorClass = Runtime.define_class("LoadError", ScriptErrorClass);
const NotImplementedErrorClass = Runtime.define_class("NoMethodError", ScriptErrorClass);

export abstract class RubyError extends Error {
    private rvalue: RValue;
    public backtrace: string[];

    to_rvalue(): RValue {
        this.rvalue ||= new RValue(this.ruby_class, this);
        return this.rvalue;
    }

    abstract get ruby_class(): RValue;
}

export class NotImplementedError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }

    get ruby_class(): RValue {
        return NotImplementedErrorClass;
    }
}

export class NameError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "NameError";
    }

    get ruby_class(): RValue {
        return NameErrorClass;
    }
}

export class LocalJumpError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "LocalJumpError";
    }

    get ruby_class(): RValue {
        return LocalJumpErrorClass;
    }
}

export class NoMethodError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "NoMethodError";
    }

    get ruby_class(): RValue {
        return NoMethodErrorClass;
    }
}

export class TypeError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "TypeError";
    }

    get ruby_class(): RValue {
        return TypeErrorClass;
    }
}

export class LoadError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "LoadError";
    }

    get ruby_class(): RValue {
        return LoadErrorClass;
    }
}

export class RuntimeError extends RubyError {
    constructor(message: string) {
        super(message);
        this.name = "RuntimeError";
    }

    get ruby_class(): RValue {
        return RuntimeErrorClass;
    }
}
