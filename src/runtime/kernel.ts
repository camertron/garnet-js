import { is_node } from "../env";
import { ArgumentError, IRubyError, LocalJumpError, NameError, NoMethodError, NotImplementedError, RuntimeError, SystemExit, TypeError } from "../errors";
import { BreakError, ExecutionContext, ThrowError } from "../execution_context";
import { Module, Qfalse, Qnil, Qtrue, RValue, Runtime, ClassClass, ModuleClass, Class, KernelModule, Visibility, Callable, ObjectClass, InterpretedCallable, NativeCallable, STDERR, IO } from "../runtime";
import { vmfs } from "../vmfs";
import { Integer } from "./integer";
import { Object } from "./object";
import { RubyString } from "../runtime/string";
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
import { Method } from "./method";
import { sprintf } from "./printf";

export class Kernel {
    public static exit_handlers: RValue[] = [];

    static async is_a(obj: RValue, mod: RValue): Promise<boolean> {
        let found = false;
        let root;

        if (obj.has_singleton_class()) {
            root = obj.get_singleton_class();
        } else {
            root = obj.klass
        }

        await Runtime.each_unique_ancestor(root, true, async (ancestor) => {
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

    mod.define_native_method("puts", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        return await Object.send(ExecutionContext.current.globals["$stdout"], "puts", args);
    });

    mod.define_native_singleton_method("puts", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        return await Object.send(ExecutionContext.current.globals["$stdout"], "puts", args);
    });

    mod.define_native_method("require", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        const path = args[0];
        await Runtime.assert_type(path, await RubyString.klass());
        return await Runtime.require(path.get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("require_relative", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        const path = args[0];
        await Runtime.assert_type(path, await RubyString.klass());
        return await Runtime.require_relative(path.get_data<string>(), ExecutionContext.current.frame!.iseq.absolute_path) ? Qtrue : Qfalse;
    });

    mod.define_native_method("load", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        const path = args[0];
        await Runtime.assert_type(path, await RubyString.klass());
        return await Runtime.load(path.get_data<string>(), path.get_data<string>()) ? Qtrue : Qfalse;
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

    mod.define_native_method("is_a?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const target = args[0];

        if (target.klass == ClassClass || target.klass == ModuleClass) {
            return await Kernel.is_a(self, target) ? Qtrue : Qfalse;
        } else {
            throw new TypeError("class or module required");
        }
    });

    await mod.alias_method("kind_of?", "is_a?");

    mod.define_native_method("instance_of?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        await Runtime.assert_type(args[0], ClassClass);
        return self.klass === args[0] ? Qtrue : Qfalse;
    });

    mod.define_native_method("raise", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        let instance: RValue;
        let is_new_exception = false;

        if (args.length === 0) {
            instance = await new RuntimeError("").to_rvalue();
            is_new_exception = true;
        } else {
            switch (args[0].klass) {
                case ClassClass:
                    instance = await Object.send(args[0], "new", [args[1] || Qnil]);
                    is_new_exception = true;
                    break;

                case await RubyString.klass():
                    instance = await Object.send((await Object.find_constant("RuntimeError"))!, "new", [args[0]]);
                    is_new_exception = true;
                    break;

                default:
                    instance = args[0];
                    is_new_exception = false;
            }
        }

        const ruby_error = instance.get_data<IRubyError>();

        // Only set the backtrace if this is a new exception or if the exception doesn't have a backtrace yet
        if (is_new_exception || !ruby_error.backtrace_rval) {
            const backtrace = await ExecutionContext.current.create_backtrace_rvalue();
            const locations: RValue[] = [];

            for (const element of backtrace.get_data<RubyArray>().elements) {
                // @TODO: avoid all this error-prone string processing
                const [path, line_and_label] = element.get_data<string>().split(":");
                const [line, label] = line_and_label.split(" in ");
                locations.push(await BacktraceLocation.new(path, parseInt(line), label));
            }

            ruby_error.backtrace = backtrace.get_data<string[]>();
            ruby_error.backtrace_rval = backtrace;
            ruby_error.backtrace_locations = locations;
            ruby_error.backtrace_locations_rval = await RubyArray.new(locations);
        }

        throw instance;
    });

    mod.define_native_method("respond_to?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (await Object.find_method_under(self, args[0].get_data<string>())) {
            return Qtrue;
        } else {
            return Qfalse;
        }
    });

    mod.define_native_method("at_exit", (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
        if (block) {
            Kernel.exit_handlers.unshift(block);
            return block;
        }

        throw new ArgumentError("at_exit called without a block");
    });

    mod.define_native_method("`", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (!is_node) {
            throw new RuntimeError("backticks are only supported in nodejs");
        }

        const result = (child_process as typeof import("child_process")).spawnSync(args[0].get_data<string>());
        return await RubyString.new(result.stdout.toString('utf-8')); // hopefully utf-8 is ok
    });

    mod.define_native_method("class", (self: RValue): RValue => {
        return self.klass;
    });

    mod.define_native_method("Integer", async (self: RValue, args: RValue[]): Promise<RValue> => {
        switch (args[0].klass) {
            case await Integer.klass():
                return args[0];

            case await Float.klass():
                return Integer.get(Math.floor(args[0].get_data<number>()));

            case await RubyString.klass():
                const str = args[0].get_data<string>();

                if (str.match(/^\d+$/)) {
                    return Integer.get(parseInt(str));
                }

                break;
        }

        const arg_str = (await Object.send(args[0], "inspect")).get_data<string>();
        throw new ArgumentError(`invalid value for Integer(): ${arg_str}`);
    });

    mod.define_native_method("Array", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args[0].klass === await RubyArray.klass()) {
            return args[0];
        } else if ((await Object.send(args[0], "respond_to?", [await Runtime.intern("to_ary")])).is_truthy()) {
            return await Object.send(args[0], "to_ary");
        } else if ((await Object.send(args[0], "respond_to?", [await Runtime.intern("to_a")])).is_truthy()) {
            return await Object.send(args[0], "to_a");
        } else {
            return RubyArray.new([args[0]]);
        }
    });

    mod.define_native_method("Rational", async (self: RValue, args: RValue[]): Promise<RValue> => {
        return await Object.send((await Object.find_constant("Rational"))!, "new", args);
    });

    mod.define_native_method("instance_variable_get", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const key = (await Object.send(args[0], "to_s")).get_data<string>()
        return self.iv_get(key);
    });

    mod.define_native_method("lambda", (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
        if (!block) {
            throw new ArgumentError("tried to create a Proc object without a block");
        }

        return block;
    });

    mod.define_native_method("proc", (self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
        if (!block) {
            throw new ArgumentError("tried to create a Proc object without a block");
        }

        return block;
    });

    mod.define_native_method("object_id", async (self: RValue): Promise<RValue> => {
        return await Integer.get(self.object_id);
    });

    await mod.alias_method("__id__", "object_id");

    mod.define_native_method("instance_variable_set", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === await RubyString.klass() || first_arg.klass === await Symbol.klass()) {
            const ivar_name = first_arg.get_data<string>();
            self.iv_set(ivar_name, args[1]);
            return args[1];
        } else {
            throw new TypeError(`${(await Object.send(args[1], "inspect")).get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("instance_variable_get", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const first_arg = args[0] || Qnil;

        if (first_arg.klass === await RubyString.klass() || first_arg.klass === await Symbol.klass()) {
            const ivar_name = first_arg.get_data<string>();
            return self.iv_get(ivar_name);
        } else {
            throw new TypeError(`${(await Object.send(args[1], "inspect")).get_data<string>()} is not a symbol nor a string`)
        }
    });

    mod.define_native_method("exit", async (self: RValue, args: RValue[]): Promise<RValue> => {
        let status = 0;
        let message = null;

        if (args.length > 0) {
            const arg = args[0];

            if (arg === Qtrue) {
                status = 0;
            } else if (arg === Qfalse) {
                status = 1;
            } else {
                await Runtime.assert_type(arg, await Integer.klass());
                status = arg.get_data<number>();
            }
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

    mod.define_native_method("exec", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (!is_node) {
            throw new RuntimeError("Kernel#exec is only supported in nodejs");
        }

        const first_arg = args[0] || Qnil;

        if (first_arg.klass === await RubyString.klass()) {
            if (args[1]) {
                if (args[1].klass === await RubyArray.klass()) {
                    const elems = args[1].get_data<RubyArray>().elements;

                    for (const elem of elems) {
                        await Runtime.assert_type(elem, await RubyString.klass());
                    }

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
        } else if (first_arg.klass === await Hash.klass()) {
            throw new NotImplementedError("passing a hash as the first argument to Kernel#exec is not yet supported");
        } else if (first_arg.klass === await RubyArray.klass()) {
            const elems = args[0].get_data<RubyArray>().elements;

            for (const elem of elems) {
                await Runtime.assert_type(elem, await RubyString.klass());
            }

            const elem_strings = elems.map((elem) => elem.get_data<string>());
            // kexec(elem_strings.join(" "));
            return Qnil;
        } else {
            throw new ArgumentError(`unexpected ${first_arg.klass.get_data<Class>().name} passed as the first argument to Kernel#exec`);
        }
    });

    mod.define_native_method("__dir__", async (self: RValue, args: RValue[]): Promise<RValue> => {
        return await RubyString.new(vmfs.dirname(ExecutionContext.current.frame!.iseq.file));
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

    mod.define_native_method("autoload", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const constant = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        const file = (await Runtime.coerce_to_string(args[1])).get_data<string>();

        if (!CONSTANT_RE.test(constant)) {
            throw new NameError(`autoload must be constant name: ${constant}`);
        }

        self.get_data<Module>().add_autoload(constant, file);
        return Qnil;
    });

    mod.define_native_method("extend", async (self: RValue, args: RValue[]): Promise<RValue> => {
        for (const module of args) {
            await Runtime.assert_type(module, ModuleClass);

            // we can't just call Module.extend here because self might not be a module (eg. in cases
            // where we're extending an instance's singleton class), and only modules respond to extend()
            const singleton_class = self.get_singleton_class();
            singleton_class.get_data<Class>().include(module);

            await Object.send(module, "extended", [self]);
        }

        return self;
    });

    // stub that does nothing so we can call it without checking to see if it's defined
    mod.define_native_method("extended", (): RValue => {
        return Qnil;
    });

    mod.define_native_method("tap", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            try {
                await block.get_data<Proc>().call(ExecutionContext.current, [self]);
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

    mod.define_native_method("hash", async (self: RValue): Promise<RValue> => {
        return await Integer.get(obj_id_hash(self.object_id));
    });

    mod.define_native_method("caller", async (_self: RValue): Promise<RValue> => {
        return await ExecutionContext.current.create_backtrace_rvalue();
    });

    mod.define_native_method("caller_locations", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        let start = 0;
        let length = -1;

        if (args.length === 1) {
            if (args[0].klass === (await Object.find_constant("Range"))!) {
                const range = args[0].get_data<Range>();
                await Runtime.assert_type(range.begin, await Integer.klass());
                await Runtime.assert_type(range.end, await Integer.klass());
                start = range.begin.get_data<number>();
                length = range.end.get_data<number>() - start;
            }
        } else if (args.length === 2) {
            await Runtime.assert_type(args[0], await Integer.klass());
            await Runtime.assert_type(args[1], await Integer.klass());
            start = args[0].get_data<number>();
            length = args[1].get_data<number>();
        }

        const backtrace = ExecutionContext.current.create_backtrace(start, length);
        const locations = []

        for (const element of backtrace) {
            // @TODO: avoid splitting a string here, maybe we can store backtraces as tuples?
            const [path, line_and_label] = element.split(":");
            const [line, label] = line_and_label.split(" in ");
            locations.push(await BacktraceLocation.new(path, parseInt(line), label));
        }

        return RubyArray.new(locations);
    });

    mod.define_native_method("throw", (_self: RValue, args: RValue[]): RValue => {
        throw new ThrowError(args[0], args[1] || Qnil);
    });

    mod.define_native_method("catch", async (_self: RValue, args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        const tag = args[0] || Object.new();

        if (!block) {
            throw new LocalJumpError("no block given");
        }

        const proc = block.get_data<Proc>();

        try {
            return await proc.call(ExecutionContext.current, [tag]);
        } catch (e) {
            if (e instanceof ThrowError) {
                if ((await Object.send(e.tag, "==", [tag])).is_truthy()) {
                    return e.value;
                }
            }

            throw e;
        }
    });

    mod.define_native_method("instance_variable_defined?", async (self: RValue, args: RValue[]): Promise<RValue> => {
        if (args[0].klass !== await RubyString.klass() && args[0].klass !== await Symbol.klass()) {
            const inspect_str = (await Object.send(args[0], "inspect")).get_data<string>()
            throw new TypeError(`${inspect_str} is not a symbol nor a string`);
        }

        return self.iv_exists(args[0].get_data<string>()) ? Qtrue : Qfalse;
    });

    mod.define_native_method("public_send", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
        const method_name = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        const method = await Object.find_method_under(self, method_name);

        if (!method) {
            const inspect_str = (await Object.send(self, "inspect")).get_data<string>()
            throw new NoMethodError(`undefined \`${method_name}' called for ${inspect_str}`);
        }

        if (method.visibility !== Visibility.public) {
            const inspect_str = (await Object.send(self, "inspect")).get_data<string>();
            const visibility_str = method.visibility === Visibility.private ? "private" : "protected";
            throw new NoMethodError(`${visibility_str} \`${method_name}' called for ${inspect_str}`);
        }

        let forwarded_call_data = call_data;
        let forwarded_args = args.slice(1);

        if (method instanceof NativeCallable) {
            // Forward the call to a native method by splatting the remaining args.
            forwarded_call_data = MethodCallData.create(
                method_name,
                args.length - 1,
                CallDataFlag.ARGS_SIMPLE | CallDataFlag.ARGS_SPLAT,
                call_data?.kw_arg || (kwargs ? kwargs.string_keys() : [])
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
            forwarded_args = [await RubyArray.new(forwarded_args)];
        }

        return await method.call(
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

    mod.define_native_method("sleep", async (_self: RValue, args: RValue[]): Promise<RValue> => {
        if (args[0].klass !== await Integer.klass() && args[0].klass !== await Float.klass()) {
            throw new ArgumentError(`can't convert ${args[0].klass.get_data<Class>().name} into time interval`);
        }

        const interval_secs = args[0].get_data<number>();
        msleep(interval_secs * 1000);

        return args[0];
    });

    mod.define_native_method("to_enum", async (self: RValue, args: RValue[], kwargs?: Hash): Promise<RValue> => {
        const method_name = args[0].get_data<string>();
        return await Enumerator.for_method(self, method_name, args.slice(1), kwargs);
    });

    mod.define_native_method("loop", async (_self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
        if (block) {
            const proc = block.get_data<Proc>();

            try {
                while (true) {
                    await proc.call(ExecutionContext.current, []);
                }
            } catch (e) {
                if (e instanceof BreakError) {
                    return e.value;
                }

                throw e;
            }
        } else {
            return await Enumerator.for_native_generator(async function* () {
                while (true) {
                    yield Qnil;
                }
            });
        }
    });

    mod.define_native_method("method", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const method_name = (await Runtime.coerce_to_string(args[0])).get_data<string>();
        const callable = await Object.find_method_under(self, method_name);

        if (callable) {
            return Method.new(method_name, callable);
        }

        throw new NameError(`undefined method \`${method_name}' for class ${self.klass.get_data<Class>().name}`);
    });

    const methods_from = (mod: RValue): string[] => {
        const results = [];
        const mod_methods = mod.get_data<Module>().methods;

        for (const method_name in mod_methods) {
            const method = mod_methods[method_name];

            switch (method.visibility) {
                case Visibility.public:
                case Visibility.protected:
                    results.push(method_name);
                    break;
            }
        }

        return results;
    }

    mod.define_native_method("methods", async (self: RValue, args: RValue[]): Promise<RValue> => {
        const include_super = (args[0] || Qtrue).is_truthy();
        const method_names = [];

        let start_mod: RValue;

        if (self.has_singleton_class()) {
            start_mod = self.get_singleton_class();
        } else {
            start_mod = self.klass;
        }

        if (include_super) {
            await Runtime.each_unique_ancestor(start_mod, true, async (ancestor: RValue): Promise<boolean> => {
                method_names.push(...await methods_from(ancestor));
                return true;
            });
        } else {
            method_names.push(...await methods_from(start_mod));
        }

        const results = [];

        for (const method_name of method_names) {
            results.push(await Runtime.intern(method_name));
        }

        return await RubyArray.new(results);
    });

    mod.define_native_method("binding", async (self: RValue): Promise<RValue> => {
        return await Binding.from_binding(ExecutionContext.current.get_binding());
    });

    mod.define_native_method("sprintf", async (self: RValue, args: RValue[]): Promise<RValue> => {
        return await sprintf(args[0], args.slice(1));
    });

    mod.define_native_method("warn", async (self: RValue, args: RValue[]): Promise<RValue> => {
        for (const arg of args) {
            const str = (await Runtime.coerce_to_string(arg)).get_data<string>();
            STDERR.get_data<IO>().write(str.endsWith("\n") ? str : `${str}\n`);
        }

        return Qnil;
    });
};
