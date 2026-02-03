import { ArgumentError, NameError } from "../errors";
import { Callable, Class, InterpretedCallable, ObjectClass, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object"
import { RubyArray } from "../runtime/array"
import { ExecutionContext, Qnil } from "../garnet";
import { Proc } from "./proc";
import { MethodCallData } from "../call_data";
import { Hash } from "./hash";
import { Integer } from "./integer";

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
            return await Proc.from_native_fn(ExecutionContext.current, async (block_self: RValue, block_args: RValue[], block_kwargs?: Hash, block_block?: RValue, block_call_data?: MethodCallData): Promise<RValue> => {
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
                    block_self,
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
    });

    Runtime.define_class("UnboundMethod", ObjectClass, (klass: Class) => {
        klass.define_native_method("owner", (self: RValue): RValue => {
            return self.get_data<UnboundMethod>().callable.owner?.rval || Qnil;
        });
    });

    inited = true;
}
