import { Class, Module, ObjectClass, Qnil, Qtrue, RValue, Runtime } from "./runtime";
import { Object } from "./runtime/object";
import { RubyString } from "./runtime/string";
import { RubyArray } from "./runtime/array";

export const init = () => {
    const ExceptionClass = Runtime.define_class("Exception", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.data = new UserDefinedException(self.klass, args[0] || Qnil);
            return Qnil;
        });

        klass.define_native_method("message", async (self: RValue): Promise<RValue> => {
            const message = self.get_data<IRubyError>().message;

            if (message instanceof RValue) {
                return message;
            } else {
                return await RubyString.new(message);
            }
        });

        await klass.alias_method("to_s", "message");

        klass.define_native_method("full_message", async (self: RValue): Promise<RValue> => {
            const error = self.get_data<IRubyError>();
            const message = error.message instanceof RValue ? error.message.get_data<string>() : error.message;
            const lines = [`${error.backtrace[0]}: ${message} (${self.klass.get_data<Class>().name})`];

            for (let i = 1; i < error.backtrace.length; i ++) {
                lines.push(`    ${error.backtrace[i]}`);
            }

            return await RubyString.new(lines.join("\n"));
        });

        klass.define_native_method("set_backtrace", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Runtime.assert_type(args[0], await RubyArray.klass());
            const backtrace = [];

            for (const element of args[0].get_data<RubyArray>().elements) {
                await Runtime.assert_type(element, await RubyString.klass());
                backtrace.push(element.get_data<string>());
            }

            const error = self.get_data<IRubyError>();
            error.backtrace = backtrace;
            error.backtrace_rval = await RubyArray.new([...args[0].get_data<RubyArray>().elements]);

            return Qnil;
        });

        klass.define_native_method("backtrace", async (self: RValue): Promise<RValue> => {
            const error = self.get_data<IRubyError>();

            if (error.backtrace_rval === Qnil) {
                if (!error.backtrace) {
                    return Qnil;
                }

                const backtrace = [];

                for (const element of error.backtrace) {
                    backtrace.push(await RubyString.new(element));
                }

                error.backtrace_rval = await RubyArray.new(backtrace);
            }

            return error.backtrace_rval;
        });

        klass.define_native_method("backtrace_locations", (self: RValue): RValue => {
            return self.get_data<IRubyError>().backtrace_locations_rval;
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
    const ThreadErrorClass = Runtime.define_class("ThreadError", StandardErrorClass);
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
    const ErrnoENOTDIRClass = Runtime.define_class_under(ErrnoModule, "ENOTDIR", SystemCallErrorClass);
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
    public backtrace_rval: RValue = Qnil;
    public backtrace_locations: RValue[];
    public backtrace_locations_rval: RValue = Qnil;

    async to_rvalue(): Promise<RValue> {
        this.rvalue ||= new RValue(await this.ruby_class(), this);
        return this.rvalue;
    }

    abstract ruby_class(): Promise<RValue>;
}

export class UserDefinedException {
    private klass: RValue;
    public message: RValue;
    public backtrace: string[];
    public backtrace_rval: RValue = Qnil;
    public backtrace_locations: RValue[];
    public backtrace_locations_rval: RValue = Qnil;

    constructor(klass: RValue, message: RValue) {
        this.klass = klass;
        this.message = message;
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(this.klass);
    }
}

export type IRubyError = RubyError | UserDefinedException;

export class StandardError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "StandardError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(StandardError.ruby_class ||= (await Object.find_constant("StandardError"))!);
    }
}

export class NotImplementedError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(NotImplementedError.ruby_class ||= (await Object.find_constant("NotImplementedError"))!);
    }
}

export class NameError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NameError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(NameError.ruby_class ||= (await Object.find_constant("NameError"))!);
    }
}

export class LocalJumpError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LocalJumpError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(LocalJumpError.ruby_class ||= (await Object.find_constant("LocalJumpError"))!);
    }
}

export class NoMethodError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "NoMethodError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(NoMethodError.ruby_class ||= (await Object.find_constant("NoMethodError"))!);
    }
}

export class ArgumentError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ArgumentErrorClass";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(ArgumentError.ruby_class ||= (await Object.find_constant("ArgumentError"))!);
    }
}

export class TypeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "TypeError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(TypeError.ruby_class ||= (await Object.find_constant("TypeError"))!);
    }
}

export class LoadError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "LoadError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(LoadError.ruby_class ||= (await Object.find_constant("LoadError"))!);
    }
}

export class RuntimeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RuntimeError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(RuntimeError.ruby_class ||= (await Object.find_constant("RuntimeError"))!);
    }
}

export class IndexError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "IndexError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(IndexError.ruby_class ||= (await Object.find_constant("IndexError"))!);
    }
}

export class StopIteration extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "StopIteration";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(StopIteration.ruby_class ||= (await Object.find_constant("StopIteration"))!);
    }
}

export class RangeError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "RangeError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(RangeError.ruby_class ||= (await Object.find_constant("RangeError"))!);
    }
}

export class KeyError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "KeyError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(KeyError.ruby_class ||= (await Object.find_constant("KeyError"))!);
    }
}

export class FrozenError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "FrozenError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(FrozenError.ruby_class ||= (await Object.find_constant("FrozenError"))!);
    }
}

export class SyntaxError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "SyntaxError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(SyntaxError.ruby_class ||= (await Object.find_constant("SyntaxError"))!);
    }
}

export class ErrnoENOENT extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ENOENT";
    }

    async ruby_class() {
        return ErrnoENOENT.ruby_class ||= (await (await Object.find_constant("Errno"))!.get_data<Module>().find_constant("ENOENT"))!;
    }
}

export class ErrnoEINVAL extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "EINVAL";
    }

    async ruby_class() {
        return ErrnoEINVAL.ruby_class ||= (await (await Object.find_constant("Errno"))!.get_data<Module>().find_constant("EINVAL"))!;
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

    async ruby_class() {
        return SystemExit.ruby_class ||= (await Object.find_constant("SystemExit"))!;
    }
}

export class EncodingCompatibilityError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Encoding::CompatibilityError";
    }

    async ruby_class() {
        return (EncodingCompatibilityError.ruby_class ||= (await (await Object.find_constant("Encoding"))!.get_data<Module>().find_constant("CompatibilityError")))!;
    }
}

export class EncodingConverterNotFoundError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Encoding::ConverterNotFoundError";
    }

    async ruby_class() {
        return EncodingConverterNotFoundError.ruby_class ||= (await (await Object.find_constant("Encoding"))!.get_data<Module>().find_constant("ConverterNotFoundError"))!;
    }
}

export class ThreadError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ThreadError";
    }

    async ruby_class(): Promise<RValue> {
        return ThreadError.ruby_class ||= (await Object.find_constant("ThreadError"))!;
    }
}

export class ZeroDivisionError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "ZeroDivisionError";
    }

    async ruby_class(): Promise<RValue> {
        return ZeroDivisionError.ruby_class ||= (await Object.find_constant("ZeroDivisionError"))!;
    }
}
