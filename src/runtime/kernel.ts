import { is_node } from "../env";
import { ArgumentError, IRubyError, LocalJumpError, NameError, NoMethodError, NotImplementedError, RuntimeError, SystemExit, TypeError } from "../errors";
import { BreakError, ExecutionContext, ThrowError } from "../execution_context";
import { Module, Qfalse, Qnil, Qtrue, RValue, Runtime, ClassClass, ModuleClass, Class, KernelModule, Kwargs, Visibility, Callable, ObjectClass, InterpretedCallable, NativeCallable } from "../runtime";
import { vmfs } from "../vmfs";
import { Integer } from "./integer";
import { Object } from "./object";
import { String } from "../runtime/string";
import { Proc } from "./proc";
import { obj_id_hash } from "../util/object_id";
import { BacktraceLocation } from "../lib/thread";
import { Range } from "./range";
import { CallDataFlag, MethodCallData } from "../call_data";
import { RubyArray } from "../runtime/array";
import { Symbol } from "../runtime/symbol";
import { Hash } from "./hash";
import { Float } from "./float";
import { Enumerator } from "./enumerator";
import { Binding } from "./binding";

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

export class Method {
    private static klass_: RValue;

    static new(name: string, callable: Callable): RValue {
        return new RValue(this.klass, new Method(name, callable));
    }

    static get klass(): RValue {
        if (!this.klass_) {
            const klass = Object.find_constant("Method");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant Method");
            }
        }

        return this.klass_;
    }

    public name: string;
    public callable: Callable;

    constructor(name: string, callable: Callable) {
        this.name = name;
        this.callable = callable;
    }
}

export const init = async () => {
    Runtime.define_class("Method", ObjectClass, (klass: Class) => {
        klass.define_native_method("parameters", (self: RValue): RValue => {
            const callable = self.get_data<Method>().callable;

            if (!(callable instanceof InterpretedCallable)) {
                throw new ArgumentError("getting parameters for native methods is not yet supported");
            }

            return RubyArray.new(
                callable.parameters_meta.map((meta) => {
                    return RubyArray.new([
                        Runtime.intern(meta.type_str),
                        Runtime.intern(meta.name)
                    ]);
                })
            );
        });

        klass.define_native_method("to_proc", (self: RValue): RValue => {
            return Proc.from_native_fn(ExecutionContext.current, (block_self: RValue, block_args: RValue[], block_kwargs?: Kwargs, block_block?: RValue, block_call_data?: MethodCallData): RValue => {
                const mtd = self.get_data<Method>();
                let mtd_call_data;

                if (block_call_data) {
                    mtd_call_data = MethodCallData.create(
                        mtd.name,
                        block_call_data.argc,
                        block_call_data.flag,
                        block_call_data.kw_arg
                    );
                } else {
                    mtd_call_data = MethodCallData.from_args(mtd.name, block_args, block_kwargs);
                }

                return mtd.callable.call(
                    ExecutionContext.current,
                    block_self,
                    block_args,
                    block_kwargs,
                    block_block,
                    mtd_call_data
                );
            });
        });
    });

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
        return Runtime.load(path.get_data<string>(), path.get_data<string>()) ? Qtrue : Qfalse;
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

    mod.alias_method("kind_of?", "is_a?");

    mod.define_native_method("instance_of?", (self: RValue, args: RValue[]): RValue => {
        Runtime.assert_type(args[0], ClassClass);
        return self.klass === args[0] ? Qtrue : Qfalse;
    });

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

        const backtrace = ExecutionContext.current.create_backtrace_rvalue();
        const locations: RValue[] = [];

        try {
            for (const element of backtrace.get_data<RubyArray>().elements) {
                // @TODO: avoid all this error-prone string processing
                const [path, line_and_label] = element.get_data<string>().split(":");
                const [line, label] = line_and_label.split(" in ");
                locations.push(BacktraceLocation.new(path, parseInt(line), label));
            }
        } catch (e) {
            debugger;
        }

        const ruby_error = instance.get_data<IRubyError>();

        ruby_error.backtrace = backtrace.get_data<string[]>();
        ruby_error.backtrace_rval = backtrace;
        ruby_error.backtrace_locations = locations;
        ruby_error.backtrace_locations_rval = RubyArray.new(locations);

        throw instance;
    });

    mod.define_native_method("respond_to?", (self: RValue, args: RValue[]): RValue => {
        if (Object.find_method_under(self, args[0].get_data<string>())) {
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
            case Integer.klass:
                return args[0];

            case Float.klass:
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

        if (first_arg.klass === String.klass || first_arg.klass === Symbol.klass) {
            const ivar_name = first_arg.get_data<string>();
            self.iv_set(ivar_name, args[1]);
            return args[1];
        } else {
            throw new TypeError(`${Object.send(args[1], "inspect").get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("instance_variable_get", (self: RValue, args: RValue[]): RValue => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === String.klass || first_arg.klass === Symbol.klass) {
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
            Runtime.assert_type(args[0], Integer.klass);
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
        } else if (first_arg.klass === Hash.klass) {
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

    mod.define_native_method("caller", (_self: RValue): RValue => {
        return ExecutionContext.current.create_backtrace_rvalue();
    });

    mod.define_native_method("caller_locations", (_self: RValue, args: RValue[]): RValue => {
        let start = 0;
        let length = -1;

        if (args.length === 1) {
            if (args[0].klass === Object.find_constant("Range")!) {
                const range = args[0].get_data<Range>();
                Runtime.assert_type(range.begin, Integer.klass);
                Runtime.assert_type(range.end, Integer.klass);
                start = range.begin.get_data<number>();
                length = range.end.get_data<number>() - start;
            }
        } else if (args.length === 2) {
            Runtime.assert_type(args[0], Integer.klass);
            Runtime.assert_type(args[1], Integer.klass);
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
                if (Object.send(e.tag, "==", [tag]).is_truthy()) {
                    return e.value;
                }
            }

            throw e;
        }
    });

    mod.define_native_method("instance_variable_defined?", (self: RValue, args: RValue[]): RValue => {
        if (args[0].klass !== String.klass && args[0].klass !== Symbol.klass) {
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

        let forwarded_call_data = call_data;
        let forwarded_args = args.slice(1);

        if (method instanceof NativeCallable) {
            // Forward the call to a native method by splatting the remaining args.
            forwarded_call_data = MethodCallData.create(
                method_name,
                args.length - 1,
                CallDataFlag.ARGS_SIMPLE | CallDataFlag.ARGS_SPLAT,
                call_data?.kw_arg || (kwargs ? Array.from(kwargs.keys()) : [])
            )

            /* Native methods automatically unwrap splatted args. For an args list
             * where the first arg is an array, the native method dispatch logic will
             * unwrap it, which may or may not be the right thing to do. If the
             * forwarded method does not receive a splat, then all is well. If the
             * forwarded method does receive a splat however, then because of the
             * automatic unwrapping logic, it will receive three individual,
             * non-splatted args instead. To avoid this problem, we call the
             * forwarded method with splatted args, and wrap the original set of
             * args in an array. This way, the native method will remove only the
             * wrapper array and leave the rest of the args intact. Note that this
             * isn't a problem for interpreted methods because they perform much
             * smarter arg unwrapping via ExecutionContext.setup_arguments.
             */
            forwarded_args = [RubyArray.new(forwarded_args)];
        }

        return method.call(
            ExecutionContext.current,
            self,
            forwarded_args,
            kwargs,
            block,
            forwarded_call_data
        );
    });

    const msleep = (n: number) => {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
    }

    mod.define_native_method("sleep", (_self: RValue, args: RValue[]): RValue => {
        if (args[0].klass !== Integer.klass && args[0].klass !== Float.klass) {
            throw new ArgumentError(`can't convert ${args[0].klass.get_data<Class>().name} into time interval`);
        }

        const interval_secs = args[0].get_data<number>();
        msleep(interval_secs * 1000);

        return args[0];
    });

    mod.define_native_method("to_enum", (self: RValue, args: RValue[], kwargs?: Kwargs): RValue => {
        const method_name = args[0].get_data<string>();
        return Enumerator.for_method(self, method_name, args.slice(1), kwargs);
    });

    mod.define_native_method("loop", (_self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
        if (block) {
            const proc = block.get_data<Proc>();

            try {
                while (true) {
                    proc.call(ExecutionContext.current, []);
                }
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }
        } else {
            return Enumerator.for_native_generator(function* () {
                while (true) {
                    yield Qnil;
                }
            });
        }
    });

    mod.define_native_method("method", (self: RValue, args: RValue[]): RValue => {
        const method_name = Runtime.coerce_to_string(args[0]).get_data<string>();
        const callable = Object.find_method_under(self, method_name);

        if (callable) {
            return Method.new(method_name, callable);
        }

        throw new NameError(`undefined method \`${method_name}' for class ${self.klass.get_data<Class>().name}`);
    });

    mod.define_native_method("binding", (self: RValue): RValue => {
        return Binding.from_binding(ExecutionContext.current.get_binding());
    });
};
