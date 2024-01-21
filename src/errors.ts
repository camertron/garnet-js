import { Array, ArrayClass, Class, Module, ObjectClass, Qnil, Qtrue, RValue, Runtime, String } from "./runtime";

export const init = () => {
    const ExceptionClass = Runtime.define_class("Exception", ObjectClass, (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.iv_set("@message", args[0] || Qnil);
            return Qnil;
        });

        klass.define_native_method("message", (self: RValue): RValue => {
            if (!self.iv_exists("@message")) {
                self.iv_set("@message", String.new(self.get_data<Error>().message));
            }

            return self.iv_get("@message");
        });

        klass.define_native_method("full_message", (self: RValue): RValue => {
            const backtrace = self.iv_get("@__ruby_backtrace").get_data<Array>().elements;
            const message = self.iv_exists("@message") ? self.iv_get("@message").get_data<string>() : null;
            const lines = [`${backtrace[0].get_data<string>()}: ${message} (${self.klass.get_data<Class>().name})`];

            for (let i = 1; i < backtrace.length; i ++) {
                lines.push(`    ${backtrace[i].get_data<string>()}`);
            }

            return String.new(lines.join("\n"));
        });

        klass.define_native_method("set_backtrace", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], ArrayClass);
            self.iv_set("@__ruby_backtrace", args[0]);
            return Qnil;
        });

        klass.define_native_method("backtrace", (self: RValue): RValue => {
            return self.iv_get("@__ruby_backtrace");
        });
    });

    const StandardErrorClass = Runtime.define_class("StandardError", ExceptionClass);
    const TypeErrorClass = Runtime.define_class("TypeError", StandardErrorClass);
    const NameErrorClass = Runtime.define_class("NameError", StandardErrorClass);
    const LocalJumpErrorClass = Runtime.define_class("LocalJumpError", StandardErrorClass);
    const RuntimeErrorClass = Runtime.define_class("RuntimeError", StandardErrorClass);
    const IndexErrorClass = Runtime.define_class("IndexError", StandardErrorClass);
    const RangeErrorClass = Runtime.define_class("RangeError", StandardErrorClass);
    const KeyErrorClass = Runtime.define_class("KeyError", IndexErrorClass);
    const FrozenErrorClass = Runtime.define_class("FrozenError", RuntimeErrorClass);
    const NoMethodErrorClass = Runtime.define_class("NoMethodError", NameErrorClass);
    const ArgumentErrorClass = Runtime.define_class("ArgumentError", StandardErrorClass);

    const ScriptErrorClass = Runtime.define_class("ScriptError", ExceptionClass);
    const SyntaxErrorClass = Runtime.define_class("SyntaxError", ScriptErrorClass);
    const LoadErrorClass = Runtime.define_class("LoadError", ScriptErrorClass);
    const NotImplementedErrorClass = Runtime.define_class("NoMethodError", ScriptErrorClass);

    const SystemCallErrorClass = Runtime.define_class("SystemCallError", StandardErrorClass);
    const ErrnoModule = Runtime.define_module("Errno");
    const ErrnoENOENTClass = Runtime.define_class_under(ErrnoModule, "ENOENT", SystemCallErrorClass);

    const SystemExitClass = Runtime.define_class("SystemExit", ExceptionClass, (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.iv_set("@status", args[0] || Qtrue);
            self.iv_set("@message", args[0] || Qnil);
            return Qnil;
        });
    });
}

export class NativeError extends Error {
    public original_error: Error;
    public ruby_backtrace: string[];

    constructor(original_error: Error, ruby_backtrace: string[]) {
        super(original_error.message);

        this.original_error = original_error;
        this.ruby_backtrace = ruby_backtrace;
    }
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

export class IndexError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "IndexError";
    }

    get ruby_class(): RValue {
        return IndexError.ruby_class ||= Runtime.constants["IndexError"];
    }
}

export class RangeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RangeError";
    }

    get ruby_class(): RValue {
        return RangeError.ruby_class ||= Runtime.constants["RangeError"];
    }
}

export class KeyError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "KeyError";
    }

    get ruby_class(): RValue {
        return KeyError.ruby_class ||= Runtime.constants["KeyError"];
    }
}

export class FrozenError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "FrozenError";
    }

    get ruby_class(): RValue {
        return FrozenError.ruby_class ||= Runtime.constants["FrozenError"];
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

export class SystemExit extends RubyError {
    private static ruby_class: RValue | null;

    public status: number;

    constructor(status: number, message: string) {
        super(message);

        this.status = status;
        this.name = "SystemExit";
    }

    get ruby_class() {
        return SystemExit.ruby_class ||= Runtime.constants["SystemExit"];
    }
}
