import { BacktraceLocation } from "./lib/thread";
import { Class, Module, ObjectClass, Qnil, Qtrue, RValue, Runtime } from "./runtime";
import { Object } from "./runtime/object";
import { String } from "./runtime/string";
import { RubyArray } from "./runtime/array";

export const init = () => {
    const ExceptionClass = Runtime.define_class("Exception", ObjectClass, (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.data = new UserDefinedException(self.klass, args[0] || Qnil);
            return Qnil;
        });

        klass.define_native_method("message", (self: RValue): RValue => {
            const message = self.get_data<IRubyError>().message;

            if (message instanceof RValue) {
                return message;
            } else {
                return String.new(message);
            }
        });

        klass.define_native_method("full_message", (self: RValue): RValue => {
            const error = self.get_data<IRubyError>();
            const message = error.message instanceof RValue ? error.message.get_data<string>() : error.message;
            const lines = [`${error.backtrace[0]}: ${message} (${self.klass.get_data<Class>().name})`];

            for (let i = 1; i < error.backtrace.length; i ++) {
                lines.push(`    ${error.backtrace[i]}`);
            }

            return String.new(lines.join("\n"));
        });

        klass.define_native_method("set_backtrace", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], RubyArray.klass);
            const backtrace = [];

            for (const element of args[0].get_data<RubyArray>().elements) {
                Runtime.assert_type(element, String.klass);
                backtrace.push(element.get_data<string>());
            }

            const error = self.get_data<IRubyError>();
            error.backtrace = backtrace;
            error.backtrace_rval = RubyArray.new([...args[0].get_data<RubyArray>().elements]);

            return Qnil;
        });

        klass.define_native_method("backtrace", (self: RValue): RValue => {
            const error = self.get_data<IRubyError>();

            if (!error.backtrace_rval) {
                const backtrace = [];

                for (const element of error.backtrace) {
                    backtrace.push(String.new(element));
                }

                error.backtrace_rval = RubyArray.new(backtrace);
            }

            return error.backtrace_rval;
        });

        klass.define_native_method("backtrace_locations", (self: RValue): RValue => {
            const backtrace = self.get_data<IRubyError>().backtrace;
            const locations = []

            for (const element of backtrace) {
                // @TODO: avoid splitting a string here, maybe we can store backtraces as tuples?
                const [path, line_and_label] = element.split(":");
                const [line, label] = line_and_label.split(" in ");
                locations.push(BacktraceLocation.new(path, parseInt(line), label));
            }

            return RubyArray.new(locations);
        });
    });

    const StandardErrorClass = Runtime.define_class("StandardError", ExceptionClass);
    const TypeErrorClass = Runtime.define_class("TypeError", StandardErrorClass);
    const NameErrorClass = Runtime.define_class("NameError", StandardErrorClass);
    const LocalJumpErrorClass = Runtime.define_class("LocalJumpError", StandardErrorClass);
    const RuntimeErrorClass = Runtime.define_class("RuntimeError", StandardErrorClass);
    const IndexErrorClass = Runtime.define_class("IndexError", StandardErrorClass);
    const StopIterationClass = Runtime.define_class("StopIteration", IndexErrorClass);
    const RangeErrorClass = Runtime.define_class("RangeError", StandardErrorClass);
    const EncodingErrorClass = Runtime.define_class("EncodingError", StandardErrorClass);
    const ThreadErrorClass = Runtime.define_class("ThreadErrorError", StandardErrorClass);
    const ZeroDivisionError = Runtime.define_class("ZeroDivisionError", StandardErrorClass);
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
    const ErrnoEINVALClass = Runtime.define_class_under(ErrnoModule, "EINVAL", SystemCallErrorClass);

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
    public backtrace_rval: RValue;

    to_rvalue(): RValue {
        this.rvalue ||= new RValue(this.ruby_class, this);
        return this.rvalue;
    }

    abstract get ruby_class(): RValue;
}

export class UserDefinedException {
    private klass: RValue;
    public message: RValue;
    public backtrace: string[];
    public backtrace_rval: RValue;

    constructor(klass: RValue, message: RValue) {
        this.klass = klass;
        this.message = message;
    }

    get ruby_class(): RValue {
        return this.klass;
    }
}

type IRubyError = RubyError | UserDefinedException;

export class StandardError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "StandardError";
    }

    get ruby_class(): RValue {
        return StandardError.ruby_class ||= Object.find_constant("StandardError")!;
    }
}

export class NotImplementedError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }

    get ruby_class(): RValue {
        return NotImplementedError.ruby_class ||= Object.find_constant("NotImplementedError")!;
    }
}

export class NameError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NameError";
    }

    get ruby_class(): RValue {
        return NameError.ruby_class ||= Object.find_constant("NameError")!;
    }
}

export class LocalJumpError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LocalJumpError";
    }

    get ruby_class(): RValue {
        return LocalJumpError.ruby_class ||= Object.find_constant("LocalJumpError")!;
    }
}

export class NoMethodError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NoMethodError";
    }

    get ruby_class(): RValue {
        return NoMethodError.ruby_class ||= Object.find_constant("NoMethodError")!;
    }
}

export class ArgumentError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ArgumentErrorClass";
    }

    get ruby_class(): RValue {
        return ArgumentError.ruby_class ||= Object.find_constant("ArgumentError")!;
    }
}

export class TypeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "TypeError";
    }

    get ruby_class(): RValue {
        return TypeError.ruby_class ||= Object.find_constant("TypeError")!;
    }
}

export class LoadError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LoadError";
    }

    get ruby_class(): RValue {
        return LoadError.ruby_class ||= Object.find_constant("LoadError")!;
    }
}

export class RuntimeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RuntimeError";
    }

    get ruby_class(): RValue {
        return RuntimeError.ruby_class ||= Object.find_constant("RuntimeError")!;
    }
}

export class IndexError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "IndexError";
    }

    get ruby_class(): RValue {
        return IndexError.ruby_class ||= Object.find_constant("IndexError")!;
    }
}

export class StopIteration extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "StopIteration";
    }

    get ruby_class(): RValue {
        return StopIteration.ruby_class ||= Object.find_constant("StopIteration")!;
    }
}

export class RangeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RangeError";
    }

    get ruby_class(): RValue {
        return RangeError.ruby_class ||= Object.find_constant("RangeError")!;
    }
}

export class KeyError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "KeyError";
    }

    get ruby_class(): RValue {
        return KeyError.ruby_class ||= Object.find_constant("KeyError")!;
    }
}

export class FrozenError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "FrozenError";
    }

    get ruby_class(): RValue {
        return FrozenError.ruby_class ||= Object.find_constant("FrozenError")!;
    }
}

export class SyntaxError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "SyntaxError";
    }

    get ruby_class(): RValue {
        return SyntaxError.ruby_class ||= Object.find_constant("SyntaxError")!;
    }
}

export class ErrnoENOENT extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ENOENT";
    }

    get ruby_class() {
        return ErrnoENOENT.ruby_class ||= Object.find_constant("Errno")!.get_data<Module>().find_constant("ENOENT")!;
    }
}

export class ErrnoEINVAL extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "EINVAL";
    }

    get ruby_class() {
        return ErrnoEINVAL.ruby_class ||= Object.find_constant("Errno")!.get_data<Module>().find_constant("EINVAL")!;
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
        return SystemExit.ruby_class ||= Object.find_constant("SystemExit")!;
    }
}

export class EncodingCompatibilityError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Encoding::CompatibilityError";
    }

    get ruby_class(): RValue {
        return EncodingCompatibilityError.ruby_class ||= Object.find_constant("Encoding")!.get_data<Module>().find_constant("CompatibilityError")!;
    }
}

export class EncodingConverterNotFoundError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Encoding::ConverterNotFoundError";
    }

    get ruby_class(): RValue {
        return EncodingConverterNotFoundError.ruby_class ||= Object.find_constant("Encoding")!.get_data<Module>().find_constant("ConverterNotFoundError")!;
    }
}

export class ThreadError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ThreadError";
    }

    get ruby_class(): RValue {
        return ThreadError.ruby_class ||= Object.find_constant("ThreadError")!;
    }
}

export class ZeroDivisionError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ZeroDivisionError";
    }

    get ruby_class(): RValue {
        return ZeroDivisionError.ruby_class ||= Object.find_constant("ZeroDivisionError")!;
    }
}
