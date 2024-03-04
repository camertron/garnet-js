import { is_node } from "../env";
import { ArgumentError, LocalJumpError, NameError, NoMethodError, NotImplementedError, RuntimeError, SystemExit, TypeError } from "../errors";
import { BreakError, ExecutionContext, ThrowError } from "../execution_context";
import { Module, Qfalse, Qnil, Qtrue, RValue, Runtime, ClassClass, ModuleClass, Class, KernelModule, IntegerClass, HashClass, SymbolClass, FloatClass, Kwargs, Visibility } from "../runtime";
import { vmfs } from "../vmfs";
import { Integer } from "./integer";
import { Object } from "./object";
import { String } from "../runtime/string";
import { Proc } from "./proc";
import { obj_id_hash } from "../util/object_id";
import { BacktraceLocation } from "../lib/thread";
import { Range } from "./range";
import { MethodCallData } from "../call_data";
import { RubyArray } from "../runtime/array";

export class Kernel {
    public static exit_handlers: RValue[] = [];

    static is_a(obj: RValue, mod: RValue): boolean {
        let found = false;

        Runtime.each_unique_ancestor(obj.klass, true, (ancestor) => {
            if (mod == ancestor) {
                found = true;
                return false;
            }

            return true;
        });

        return found;
    }
}

export const init = async () => {
    const mod = KernelModule.get_data<Module>();
    let child_process: unknown;
    // let kexec: (executable: string, args?: string[]) => never;

    if (is_node) {
        // child_process = await import("child_process");

        // @ts-ignore
        // kexec = (await import("@gongt/kexec")).default;
    }

    mod.define_native_method("puts", (_self: RValue, args: RValue[]): RValue => {
        return Object.send(ExecutionContext.current.globals["$stdout"], "puts", args);
    });

    mod.define_native_singleton_method("puts", (_self: RValue, args: RValue[]): RValue => {
        return Object.send(ExecutionContext.current.globals["$stdout"], "puts", args);
    });

    mod.define_native_method("require", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, String.klass);
        return Runtime.require(path.get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("require_relative", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, String.klass);
        return Runtime.require_relative(path.get_data<string>(), ExecutionContext.current.frame!.iseq.file) ? Qtrue : Qfalse;
    });

    mod.define_native_method("load", (_self: RValue, args: RValue[]): RValue => {
        const path = args[0];
        Runtime.assert_type(path, String.klass);
        return Runtime.load(path.get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("===", (self: RValue, args: RValue[]): RValue => {
        const obj = args[0];

        if (obj.klass == ClassClass || obj.klass == ModuleClass) {
            if (self.klass.get_data<Class>() == obj.get_data<Class>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        } else {
            return Qfalse;
        }
    });

    mod.define_native_method("<=>", (_self: RValue, _args: RValue[]): RValue => {
        return Qnil;
    });

    mod.define_native_method("is_a?", (self: RValue, args: RValue[]): RValue => {
        const target = args[0];

        if (target.klass == ClassClass || target.klass == ModuleClass) {
            return Kernel.is_a(self, target) ? Qtrue : Qfalse;
        } else {
            throw new TypeError("class or module required");
        }
    });

    mod.define_native_method("instance_of?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ClassClass);
        return self.klass === args[0] ? Qtrue : Qfalse;
    });

    mod.alias_method("kind_of?", "instance_of?");

    mod.define_native_method("raise", (_self: RValue, args: RValue[]): RValue => {
        let instance;

        switch (args[0].klass) {
            case ClassClass:
                instance = Object.send(args[0], "new", [args[1] || Qnil]);
                break;

            case String.klass:
                instance = Object.send(Object.find_constant("RuntimeError")!, "new", [args[0]]);
                break;

            default:
                instance = args[0];
        }

        Object.send(instance, "set_backtrace", [ExecutionContext.current.create_backtrace_rvalue()]);

        throw instance;
    });

    mod.define_native_method("respond_to?", (self: RValue, args: RValue[]): RValue => {
        if (Object.find_method_under(self.klass, args[0].get_data<string>())) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    });

    mod.define_native_method("at_exit", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        if (block) {
            Kernel.exit_handlers.unshift(block);
            return block;
        }

        throw new ArgumentError("at_exit called without a block");
    });

    mod.define_native_method("`", (self: RValue, args: RValue[]): RValue => {
        if (!is_node) {
            throw new RuntimeError("backticks are only supported in nodejs");
        }

        const result = (child_process as typeof import("child_process")).spawnSync(args[0].get_data<string>());
        return String.new(result.stdout.toString('utf-8')); // hopefully utf-8 is ok
    });

    mod.define_native_method("class", (self: RValue): RValue => {
        return self.klass;
    });

    mod.define_native_method("Integer", (self: RValue, args: RValue[]): RValue => {
        switch (args[0].klass) {
            case IntegerClass:
                return args[0];

            case FloatClass:
                return Integer.get(Math.floor(args[0].get_data<number>()));

            case String.klass:
                const str = args[0].get_data<string>();

                if (str.match(/^\d+$/)) {
                    return Integer.get(parseInt(str));
                }

                break;
        }

        const arg_str = Object.send(args[0], "inspect").get_data<string>();
        throw new ArgumentError(`invalid value for Integer(): ${arg_str}`);
    });

    mod.define_native_method("Array", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass == RubyArray.klass) {
            return args[0];
        } else if (Object.send(args[0], "respond_to?", [Runtime.intern("to_ary")]).is_truthy()) {
            return Object.send(args[0], "to_ary");
        } else if (Object.send(args[0], "respond_to?", [Runtime.intern("to_a")]).is_truthy()) {
            return Object.send(args[0], "to_a");
        } else {
            return RubyArray.new([args[0]]);
        }
    });

    mod.define_native_method("Rational", (self: RValue, args: RValue[]): RValue => {
        return Object.send(Object.find_constant("Rational")!, "new", args);
    });

    mod.define_native_method("instance_variable_get", (self: RValue, args: RValue[]): RValue => {
        return self.iv_get(Object.send(args[0], "to_s").get_data<string>());
    });

    mod.define_native_method("lambda", (self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        if (!block) {
            throw new ArgumentError("tried to create a Proc object without a block");
        }

        return block;
    });

    mod.define_native_method("object_id", (self: RValue): RValue => {
        return Integer.get(self.object_id);
    });

    mod.alias_method("__id__", "object_id");

    mod.define_native_method("instance_variable_set", (self: RValue, args: RValue[]): RValue => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === String.klass || first_arg.klass === SymbolClass) {
            const ivar_name = first_arg.get_data<string>();
            self.iv_set(ivar_name, args[1]);
            return args[1];
        } else {
            throw new TypeError(`${Object.send(args[1], "inspect").get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("instance_variable_get", (self: RValue, args: RValue[]): RValue => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === String.klass || first_arg.klass === SymbolClass) {
            const ivar_name = first_arg.get_data<string>();
            return self.iv_get(ivar_name);
        } else {
            throw new TypeError(`${Object.send(args[1], "inspect").get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("exit", (self: RValue, args: RValue[]): RValue => {
        let status = 0;
        let message = null;

        if (args.length > 0) {
            Runtime.assert_type(args[0], IntegerClass);
            status = args[0].get_data<number>();
        }

        if (args.length > 1) {
            // ugh wtf
            message = args[0].get_data<any>();
        }

        throw new SystemExit(status, message);
    });

    mod.define_native_method("abort", (self: RValue, args: RValue[]): RValue => {
        const msg = args.length > 0 ? args[0].get_data<any>() : null;
        throw new SystemExit(1, msg);
    });

    mod.define_native_method("exec", (self: RValue, args: RValue[]): RValue => {
        if (!is_node) {
            throw new RuntimeError("Kernel#exec is only supported in nodejs");
        }

        const first_arg = args[0] || Qnil;

        if (first_arg.klass === String.klass) {
            if (args[1]) {
                if (args[1].klass === RubyArray.klass) {
                    const elems = args[1].get_data<RubyArray>().elements;
                    elems.forEach((elem) => Runtime.assert_type(elem, String.klass));
                    const elem_strings = elems.map((elem) => elem.get_data<string>());
                    // kexec(first_arg.get_data<string>(), elem_strings);
                    return Qnil;
                } else {
                    throw new NotImplementedError(`unexpected ${first_arg.get_data<Class>().name} passed as the first argument to Kernel#exec`);
                }
            } else {
                // kexec(first_arg.get_data<string>());
                return Qnil;
            }
        } else if (first_arg.klass === HashClass) {
            throw new NotImplementedError("passing a hash as the first argument to Kernel#exec is not yet supported");
        } else if (first_arg.klass === RubyArray.klass) {
            const elems = args[0].get_data<RubyArray>().elements;
            elems.forEach((elem) => Runtime.assert_type(elem, String.klass));
            const elem_strings = elems.map((elem) => elem.get_data<string>());
            // kexec(elem_strings.join(" "));
            return Qnil;
        } else {
            throw new ArgumentError(`unexpected ${first_arg.klass.get_data<Class>().name} passed as the first argument to Kernel#exec`);
        }
    });

    mod.define_native_method("__dir__", (self: RValue, args: RValue[]): RValue => {
        return String.new(vmfs.dirname(ExecutionContext.current.frame!.iseq.file));
    });

    mod.define_native_method("nil?", (self: RValue): RValue => {
        return self === Qnil ? Qtrue : Qfalse;
    });

    mod.define_native_method("singleton_class", (self: RValue): RValue => {
        if (self.klass === ClassClass || self.klass === ModuleClass) {
            return self.get_data<Module>().get_singleton_class()
        } else {
            return self.get_singleton_class();
        }
    });

    const CONSTANT_RE = /^[A-Z]\w*$/; // @TODO: is this right?

    mod.define_native_method("autoload", (self: RValue, args: RValue[]): RValue => {
        const constant = Runtime.coerce_to_string(args[0]).get_data<string>();
        const file = Runtime.coerce_to_string(args[1]).get_data<string>();

        if (!CONSTANT_RE.test(constant)) {
            throw new NameError(`autoload must be constant name: ${constant}`);
        }

        self.get_data<Module>().add_autoload(constant, file);
        return Qnil;
    });

    mod.define_native_method("extend", (self: RValue, args: RValue[]): RValue => {
        for (const module of args) {
            Runtime.assert_type(module, ModuleClass);
            self.get_data<Module>().extend(module);
            Object.send(module, "extended", [self]);
        }

        return self;
    });

    // stub that does nothing
    mod.define_native_method("extended", (): RValue => {
        return Qnil;
    });

    mod.define_native_method("tap", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        if (block) {
            try {
                block.get_data<Proc>().call(ExecutionContext.current, [self]);
                return self;
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }
        } else {
            throw new LocalJumpError("no block given (yield)");
        }
    });

    mod.define_native_method("block_given?", (_self: RValue): RValue => {
        const frame = ExecutionContext.current.frame_yield();

        if (frame && frame.block && frame.block !== Qnil) {
            return Qtrue;
        }

        return Qfalse;
    });

    mod.define_native_method("itself", (self: RValue): RValue => {
        return self;
    });

    mod.define_native_method("hash", (self: RValue): RValue => {
        return Integer.get(obj_id_hash(self.object_id));
    });

    mod.define_native_method("caller_locations", (_self: RValue, args: RValue[]): RValue => {
        let start = 0;
        let length = -1;

        if (args.length === 1) {
            if (args[0].klass === Object.find_constant("Range")!) {
                const range = args[0].get_data<Range>();
                Runtime.assert_type(range.begin, IntegerClass);
                Runtime.assert_type(range.end, IntegerClass);
                start = range.begin.get_data<number>();
                length = range.end.get_data<number>() - start;
            }
        } else if (args.length === 2) {
            Runtime.assert_type(args[0], IntegerClass);
            Runtime.assert_type(args[1], IntegerClass);
            start = args[0].get_data<number>();
            length = args[1].get_data<number>();
        }

        const backtrace = ExecutionContext.current.create_backtrace(start, length);
        const locations = []

        for (const element of backtrace) {
            // @TODO: avoid splitting a string here, maybe we can store backtraces as tuples?
            const [path, line_and_label] = element.split(":");
            const [line, label] = line_and_label.split(" in ");
            locations.push(BacktraceLocation.new(path, parseInt(line), label));
        }

        return RubyArray.new(locations);
    });

    mod.define_native_method("throw", (_self: RValue, args: RValue[]): RValue => {
        throw new ThrowError(args[0], args[1] || Qnil);
    });

    mod.define_native_method("catch", (_self: RValue, args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        const tag = args[0] || Object.new();

        if (!block) {
            throw new LocalJumpError("no block given");
        }

        const proc = block.get_data<Proc>();

        try {
            return proc.call(ExecutionContext.current, [tag]);
        } catch (e) {
            if (e instanceof ThrowError) {
                if (e.tag.object_id === tag.object_id) {
                    return e.value;
                }
            }

            throw e;
        }
    });

    mod.define_native_method("instance_variable_defined?", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass !== String.klass && args[0].klass !== SymbolClass) {
            throw new TypeError(`${Object.send(args[0], "inspect").get_data<string>()} is not a symbol nor a string`);
        }

        return self.iv_exists(args[0].get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("public_send", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue => {
        const method_name = Runtime.coerce_to_string(args[0]).get_data<string>();
        const method = Object.find_method_under(self, method_name);

        if (!method) {
            throw new NoMethodError(`undefined \`${method_name}' called for ${Object.send(self, "inspect").get_data<string>()}`);
        }

        if (method.visibility !== Visibility.public) {
            const visibility_str = method.visibility === Visibility.private ? "private" : "protected";
            throw new NoMethodError(`${visibility_str} \`${method_name}' called for ${Object.send(self, "inspect").get_data<string>()}`);
        }

        return method.call(ExecutionContext.current, self, args.slice(1), kwargs, block, call_data);
    });

    const msleep = (n: number) => {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
    }

    mod.define_native_method("sleep", (_self: RValue, args: RValue[]): RValue => {
        if (args[0].klass !== IntegerClass && args[0].klass !== FloatClass) {
            throw new ArgumentError(`can't convert ${args[0].klass.get_data<Class>().name} into time interval`);
        }

        const interval_secs = args[0].get_data<number>();
        msleep(interval_secs * 1000);

        return args[0];
    });
};
