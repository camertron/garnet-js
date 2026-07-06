import { Class, Module, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "./runtime";
import { Object } from "./runtime/object";
import { RubyString } from "./runtime/string";
import { RubyArray } from "./runtime/array";
import { Args } from "./runtime/arg-scanner";

export const init = async () => {
    const ExceptionClass = await Runtime.define_class("Exception", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            self.data = new UserDefinedException(self.klass, args[0] || Qnil);
            (self.data as UserDefinedException).rvalue = self;
            return Qnil;
        });

        klass.define_native_method("message", async (self: RValue): Promise<RValue> => {
            const message = self.get_data<IRubyError>().message;

            if (message instanceof RValue) {
                if (message === Qnil) {
                    const klass = (await self.get_data<IRubyError>().ruby_class()).get_data<Class>();
                    return RubyString.new(klass.full_name);
                } else {
                    return message;
                }
            } else {
                return await RubyString.new(message);
            }
        });

        await klass.alias_method("to_s", "message");

        klass.define_native_method("full_message", async (self: RValue): Promise<RValue> => {
            const error = self.get_data<IRubyError>();
            const message = error.message instanceof RValue ? error.message.get_data<string>() : error.message;
            const lines: string[] = [];

            if (error.backtrace) {
                lines.push(`${error.backtrace[0]}: ${message} (${self.klass.get_data<Class>().name})`);

                for (let i = 1; i < error.backtrace.length; i ++) {
                    lines.push(`    ${error.backtrace[i]}`);
                }
            } else {
                lines.push(`${message} (${self.klass.get_data<Class>().name})`);
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

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return (await self.get_data<IRubyError>().dup()).to_rvalue();
        });

        klass.define_native_method("backtrace_locations", (self: RValue): RValue => {
            return self.get_data<IRubyError>().backtrace_locations_rval;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const name = (await self.get_data<IRubyError>().ruby_class()).get_data<Class>().name;
            const message = (await Object.send(self, "to_s")).get_data<string>();

            if (message.length > 0) {
                return RubyString.new(`#<${name}: ${message}>`);
            } else {
                const klass = (await self.get_data<IRubyError>().ruby_class()).get_data<Class>();
                return RubyString.new(klass.name || klass.full_name);
            }
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const error = self.get_data<IRubyError>();
            const [other_rval] = await Args.scan("1", args);

            if (self.object_id == other_rval.object_id) {
                return Qtrue;
            }

            if (self.klass !== other_rval.klass) {
                return Qfalse;
            }

            const self_message = (await Object.send(self, "message"));
            const other_message = (await Object.send(other_rval, "message"));

            if (!(await Object.send(self_message, "==", [other_message])).is_truthy()) {
                return Qfalse;
            }

            const self_backtrace = error.backtrace_rval;
            const other_backtrace = await Object.send(other_rval, "backtrace");

            if (!(await Object.send(self_backtrace, "==", [other_backtrace])).is_truthy()) {
                return Qfalse;
            }

            return Qtrue;
        });
    });

    const NoMemoryErrorClass = await Runtime.define_class("NoMemoryError", ExceptionClass);

    const SignalExceptionClass = await Runtime.define_class("SignalException", ExceptionClass);
    const InterruptClass = await Runtime.define_class("Interrupt", SignalExceptionClass);

    const StandardErrorClass = await Runtime.define_class("StandardError", ExceptionClass);
    const TypeErrorClass = await Runtime.define_class("TypeError", StandardErrorClass);
    const NameErrorClass = await Runtime.define_class("NameError", StandardErrorClass);
    const LocalJumpErrorClass = await Runtime.define_class("LocalJumpError", StandardErrorClass);
    const RuntimeErrorClass = await Runtime.define_class("RuntimeError", StandardErrorClass);
    const IndexErrorClass = await Runtime.define_class("IndexError", StandardErrorClass);
    const StopIterationClass = await Runtime.define_class("StopIteration", IndexErrorClass);
    const RangeErrorClass = await Runtime.define_class("RangeError", StandardErrorClass);
    const FloatDomainError = await Runtime.define_class("FloatDomainError", RangeErrorClass);
    const EncodingErrorClass = await Runtime.define_class("EncodingError", StandardErrorClass);
    const ThreadErrorClass = await Runtime.define_class("ThreadError", StandardErrorClass);
    const ZeroDivisionError = await Runtime.define_class("ZeroDivisionError", StandardErrorClass);
    const KeyErrorClass = await Runtime.define_class("KeyError", IndexErrorClass);
    const FrozenErrorClass = await Runtime.define_class("FrozenError", RuntimeErrorClass);
    const NoMethodErrorClass = await Runtime.define_class("NoMethodError", NameErrorClass);
    const ArgumentErrorClass = await Runtime.define_class("ArgumentError", StandardErrorClass);
    const IOError = await Runtime.define_class("IOError", StandardErrorClass);

    const UncaughtThrowErrorClass = await Runtime.define_class("UncaughtThrowError", ArgumentErrorClass, async (klass: Class) => {
        klass.define_native_method("tag", (self: RValue): RValue => {
            return self.get_data<UncaughtThrowError>().tag;
        });
    });

    const ScriptErrorClass = await Runtime.define_class("ScriptError", ExceptionClass);
    const SyntaxErrorClass = await Runtime.define_class("SyntaxError", ScriptErrorClass);
    const LoadErrorClass = await Runtime.define_class("LoadError", ScriptErrorClass);
    const NotImplementedErrorClass = await Runtime.define_class("NoMethodError", ScriptErrorClass);

    const SystemCallErrorClass = await Runtime.define_class("SystemCallError", StandardErrorClass);
    const ErrnoModule = await Runtime.define_module("Errno");
    const ErrnoENOENTClass = await Runtime.define_class_under(ErrnoModule, "ENOENT", SystemCallErrorClass);
    const ErrnoENOTDIRClass = await Runtime.define_class_under(ErrnoModule, "ENOTDIR", SystemCallErrorClass);
    const ErrnoEINVALClass = await Runtime.define_class_under(ErrnoModule, "EINVAL", SystemCallErrorClass);
    const ErrnoEACCESClass = await Runtime.define_class_under(ErrnoModule, "EACCES", SystemCallErrorClass);

    const SystemExitClass = await Runtime.define_class("SystemExit", ExceptionClass, async (klass: Class) => {
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

    async dup(): Promise<RubyError> {
        const Constructor = this.constructor as any;
        const error = new Constructor(this.message) as this;
        if (this.backtrace) error.backtrace = [...this.backtrace];
        error.backtrace_rval = await Object.send(this.backtrace_rval, "dup");
        if (this.backtrace_locations) error.backtrace_locations = [...this.backtrace_locations];
        error.backtrace_locations_rval = await Object.send(this.backtrace_locations_rval, "dup");
        return error;
    }
}

export class UserDefinedException {
    public rvalue: RValue;
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

    async to_rvalue(): Promise<RValue> {
        this.rvalue ||= new RValue(await this.klass, this);
        return this.rvalue;
    }

    async dup(): Promise<UserDefinedException> {
        const Constructor = this.constructor as any;
        const error = new Constructor(this.klass, this.message) as this;
        if (this.backtrace) error.backtrace = [...this.backtrace];
        error.backtrace_rval = await Object.send(this.backtrace_rval, "dup");
        if (this.backtrace_locations) error.backtrace_locations = [...this.backtrace_locations];
        error.backtrace_locations_rval = await Object.send(this.backtrace_locations_rval, "dup");
        return error;
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
        this.name = "ArgumentError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(ArgumentError.ruby_class ||= (await Object.find_constant("ArgumentError"))!);
    }
}

export class UncaughtThrowError extends RubyError {
    private static ruby_class: RValue | null;
    public tag: RValue;

    constructor(tag: RValue, message: string) {
        super(message);

        this.name = "UncaughtThrowError";
        this.tag = tag;
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(UncaughtThrowError.ruby_class ||= (await Object.find_constant("UncaughtThrowError"))!);
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

export class FloatDomainError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "FloatDomainError";
    }

    async ruby_class(): Promise<RValue> {
        return Promise.resolve(FloatDomainError.ruby_class ||= (await Object.find_constant("FloatDomainError"))!);
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

export class IOError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "IOError";
    }

    async ruby_class(): Promise<RValue> {
        return IOError.ruby_class ||= (await Object.find_constant("IOError"))!;
    }
}
