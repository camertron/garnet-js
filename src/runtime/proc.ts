import { BlockCallData, MethodCallData } from "../call_data";
import { CallingConvention, ExecutionContext } from "../execution_context";
import { BlockFrame } from "../frame";
import { InstructionSequence } from "../instruction_sequence";
import { RValue, Class, ProcClass, NativeMethod, Callable, Runtime, Kwargs } from "../runtime";
import { Binding } from "./binding";
import { Object } from "../runtime/object";
import { Integer } from "./integer";

export abstract class Proc {
    public binding: Binding;
    public calling_convention: CallingConvention;

    static from_native_fn(context: ExecutionContext, method: NativeMethod, binding?: Binding): RValue {
        binding ||= context.get_binding();
        return new RValue(ProcClass, new NativeProc(method, binding));
    }

    static from_iseq(context: ExecutionContext, iseq: InstructionSequence): RValue {
        const binding = context.get_binding();
        return new RValue(ProcClass, new InterpretedProc(iseq, binding));
    }

    abstract call(context: ExecutionContext, args: RValue[], kwargs?: Kwargs, call_data?: BlockCallData): RValue;
    abstract with_binding(new_binding: Binding): Proc;
    abstract get arity(): number;
}

export class NativeProc extends Proc {
    public callable: NativeMethod;
    public binding: Binding;

    constructor(callable: NativeMethod, binding: Binding, calling_convention: CallingConvention = CallingConvention.BLOCK_PROC) {
        super();

        this.callable = callable;
        this.binding = binding;
        this.calling_convention = calling_convention;
    }

    call(_context: ExecutionContext, args: RValue[], kwargs?: Kwargs, _call_data?: BlockCallData): RValue {
        return this.callable(this.binding.self, args, kwargs);
    }

    with_binding(new_binding: Binding): NativeProc {
        return new NativeProc(this.callable, new_binding);
    }

    // @TODO: we need more info, but I'm unsure how to get it
    // I think MRI requires you to supply an arity when you define the proc/method 😱
    get arity(): number {
        return 0;
    }
}

export class InterpretedProc extends Proc {
    public iseq: InstructionSequence;
    public binding: Binding;

    constructor(iseq: InstructionSequence, binding: Binding, calling_convention: CallingConvention = CallingConvention.BLOCK_PROC) {
        super();

        this.iseq = iseq;
        this.binding = binding;
        this.calling_convention = calling_convention;
    }

    call(context: ExecutionContext, args: RValue[], kwargs?: Kwargs, call_data?: BlockCallData): RValue {
        call_data ||= BlockCallData.create(args.length);
        return context.run_block_frame(call_data, this.calling_convention, this.iseq, this.binding, args, kwargs);
    }

    with_binding(new_binding: Binding): InterpretedProc {
        return new InterpretedProc(this.iseq, new_binding);
    }

    // @TODO: flesh this out. For now, just returns the number of required positional args;
    // calculating the actual arity is much more complicated.
    get arity(): number {
        return this.iseq.argument_options.lead_num || 0;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    const klass = Object.find_constant("Proc")!.get_data<Class>();

    klass.define_native_method("call", (self: RValue, args: RValue[], kwargs?: Kwargs, block?: RValue, call_data?: MethodCallData): RValue => {
        const ec = ExecutionContext.current
        return self.get_data<Proc>().call(ec, args, kwargs, call_data || (ec.frame as BlockFrame).call_data);
    });

    klass.define_native_method("arity", (self: RValue): RValue => {
        return Integer.get(self.get_data<Proc>().arity);
    });

    klass.alias_method("[]", "call");

    inited = true;
};
