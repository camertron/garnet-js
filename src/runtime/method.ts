import { ArgumentError, NameError } from "../errors";
import { Callable, Class, InterpretedCallable, ObjectClass, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object"
import { RubyArray } from "../runtime/array"
import { ExecutionContext, Qnil } from "../garnet";
import { Proc } from "./proc";
import { MethodCallData } from "../call_data";
import { Hash } from "./hash";

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

    call(...params: Parameters<Callable["call"]>): ReturnType<Callable["call"]> {
        return this.callable.call(...params);
    }
}

export class UnboundMethod {
    private static klass_: RValue;

    static new(name: string, callable: Callable): RValue {
        return new RValue(this.klass, new UnboundMethod(name, callable));
    }

    static get klass(): RValue {
        if (!this.klass_) {
            const klass = Object.find_constant("UnboundMethod");

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
            return Proc.from_native_fn(ExecutionContext.current, (block_self: RValue, block_args: RValue[], block_kwargs?: Hash, block_block?: RValue, block_call_data?: MethodCallData): RValue => {
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

    Runtime.define_class("UnboundMethod", ObjectClass, (klass: Class) => {
        klass.define_native_method("owner", (self: RValue): RValue => {
            return self.get_data<UnboundMethod>().callable.owner?.rval || Qnil;
        });
    });

    inited = true;
}
