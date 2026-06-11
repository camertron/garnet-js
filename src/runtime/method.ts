import { ArgumentError, NameError } from "../errors";
import { Callable, Class, InterpretedCallable, ObjectClass, RValue, Runtime, Qfalse, Qtrue } from "../runtime";
import { Object } from "../runtime/object"
import { RubyArray } from "../runtime/array"
import { ExecutionContext, Qnil } from "../garnet";
import { Proc } from "./proc";
import { MethodCallData } from "../call_data";
import { Hash } from "./hash";
import { Integer } from "./integer";
import { Args } from "./arg-scanner";
import { RubyString } from "./string";

export class Method {
    private static klass_: RValue;

    static async new(name: string, callable: Callable, receiver: RValue): Promise<RValue> {
        return new RValue(await this.klass(), new Method(name, callable, receiver));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("Method");

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
    public receiver: RValue;

    constructor(name: string, callable: Callable, receiver: RValue) {
        this.name = name;
        this.callable = callable;
        this.receiver = receiver;
    }

    call(...params: Parameters<Callable["call"]>): ReturnType<Callable["call"]> {
        return this.callable.call(...params);
    }
}

export class UnboundMethod {
    private static klass_: RValue;

    static async new(name: string, callable: Callable): Promise<RValue> {
        return new RValue(await this.klass(), new UnboundMethod(name, callable));
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("UnboundMethod");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant UnboundMethod");
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

    call(...params: Parameters<Callable["call"]>): ReturnType<Callable["call"]> {
        return this.callable.call(...params);
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Method", ObjectClass, async (klass: Class) => {
        klass.define_native_method("call", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
            const mtd = self.get_data<Method>();
            let mtd_call_data;

            if (call_data) {
                mtd_call_data = MethodCallData.create(
                    mtd.name,
                    call_data.argc,
                    call_data.flag,
                    call_data.kw_arg
                );
            } else {
                mtd_call_data = MethodCallData.from_args(mtd.name, args, kwargs);
            }

            return await mtd.callable.call(
                ExecutionContext.current,
                mtd.receiver,
                args,
                kwargs,
                block,
                mtd_call_data
            );
        });

        await klass.alias_method("[]", "call");
        await klass.alias_method("===", "call");

        klass.define_native_method("parameters", async (self: RValue): Promise<RValue> => {
            const callable = self.get_data<Method>().callable;

            if (!(callable instanceof InterpretedCallable)) {
                throw new ArgumentError("getting parameters for native methods is not yet supported");
            }

            return await RubyArray.new(
                await Promise.all(
                    callable.parameters_meta.map(async (meta) => {
                        return RubyArray.new([
                            await Runtime.intern(meta.type_str),
                            await Runtime.intern(meta.name)
                        ]);
                    })
                )
            );
        });

        klass.define_native_method("to_proc", async (self: RValue): Promise<RValue> => {
            return await Proc.from_native_fn(ExecutionContext.current, async (_block_self: RValue, block_args: RValue[], block_kwargs?: Hash, block_block?: RValue, block_call_data?: MethodCallData): Promise<RValue> => {
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

                return await mtd.callable.call(
                    ExecutionContext.current,
                    mtd.receiver,
                    block_args,
                    block_kwargs,
                    block_block,
                    mtd_call_data
                );
            });
        });

        klass.define_native_method("arity", async (self: RValue): Promise<RValue> => {
            const callable = self.get_data<Method>().callable;

            if (callable instanceof InterpretedCallable) {
                const arg_opts = callable.iseq.argument_options;
                let arity = 0;

                // required positional arguments
                if (arg_opts.lead_num !== null) {
                    arity += arg_opts.lead_num;
                }

                // required post args
                if (arg_opts.post_num !== null) {
                    arity += arg_opts.post_num;
                }

                // check if there are any required kwargs
                let has_required_kwargs = false;
                let has_optional_kwargs = false;

                if (arg_opts.keyword !== null) {
                    for (const [_name, default_value] of arg_opts.keyword) {
                        if (default_value === null) {
                            has_required_kwargs = true;
                        } else {
                            has_optional_kwargs = true;
                        }
                    }
                }

                if (has_required_kwargs) {
                    arity += 1;
                }

                // If there are optional positional args, rest args, or optional kwargs,
                // return negative arity. Note: keyword rest (**kwargs) alone doesn't make
                // it negative - only if combined with optional args.
                if (arg_opts.opt.length > 0 ||
                    arg_opts.rest_start !== null ||
                    has_optional_kwargs) {
                    // From the Ruby docs: For Ruby methods that take a variable number of arguments,
                    // returns -n-1, where n is the number of required arguments.
                    return await Integer.get(-(arity + 1));
                }

                return await Integer.get(arity);
            } else {
                // can't really get arity for native methods, so return -1 to indicate variable arity
                return await Integer.get(-1);
            }
        });

        klass.define_native_method("owner", (self: RValue): RValue => {
            return self.get_data<Method>().callable.owner?.rval || Qnil;
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);

            if (other_rval.klass !== self.klass) {
                return Qfalse;
            }

            const method = self.get_data<Method>();
            const other = other_rval.get_data<Method>();

            if (method.receiver !== other.receiver) return Qfalse;
            if (method.callable !== other.callable) return Qfalse;

            return Qtrue;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const method = self.get_data<Method>();
            const pieces = [`#<Method: ${method.receiver.klass.get_data<Class>().full_name}`];
            const receiver_klass = method.receiver.klass.get_data<Class>();

            if (method.callable.owner && method.callable.owner !== receiver_klass) {
                pieces.push(`(${method.callable.owner.full_name})`);
            }

            if (receiver_klass.is_singleton_class) {
                pieces.push(".");
            } else {
                pieces.push("#");
            }

            pieces.push(method.name);
            pieces.push("()");  // @TODO: handle aliases here
            // @TODO: add file and line info
            pieces.push(">");

            return RubyString.new(pieces.join(""));
        });
    });

    Runtime.define_class("UnboundMethod", ObjectClass, async (klass: Class) => {
        klass.define_native_method("owner", (self: RValue): RValue => {
            return self.get_data<UnboundMethod>().callable.owner?.rval || Qnil;
        });

        klass.define_native_method("bind", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const unbound_method = self.get_data<UnboundMethod>();
            const receiver = args[0];

            // TODO: Add type checking to ensure receiver is kind_of? the owner class

            return await Method.new(unbound_method.name, unbound_method.callable, receiver);
        });

        klass.define_native_method("bind_call", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
            const unbound_method = self.get_data<UnboundMethod>();
            const receiver = args[0];
            const method_args = args.slice(1);

            // TODO: Add type checking to ensure receiver is kind_of? the owner class

            // Create a temporary Method object and call it
            const method = new Method(unbound_method.name, unbound_method.callable, receiver);

            let mtd_call_data;
            if (call_data) {
                mtd_call_data = MethodCallData.create(
                    method.name,
                    call_data.argc - 1,  // Subtract 1 because first arg is the receiver
                    call_data.flag,
                    call_data.kw_arg
                );
            } else {
                mtd_call_data = MethodCallData.from_args(method.name, method_args, kwargs);
            }

            return await method.callable.call(
                ExecutionContext.current,
                receiver,
                method_args,
                kwargs,
                block,
                mtd_call_data
            );
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other_rval] = await Args.scan("1", args);

            if (other_rval.klass !== self.klass) {
                return Qfalse;
            }

            const method = self.get_data<UnboundMethod>();
            const other = other_rval.get_data<UnboundMethod>();

            if (method.callable !== other.callable) return Qfalse;

            return Qtrue;
        });

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const method = self.get_data<UnboundMethod>();
            const pieces = [`#<UnboundMethod: ${method.callable.owner!.full_name}`];

            pieces.push("#");
            pieces.push(method.name);
            pieces.push("()");  // @TODO: handle aliases here
            // @TODO: add file and line info
            pieces.push(">");

            return RubyString.new(pieces.join(""));
        });
    });

    inited = true;
}
