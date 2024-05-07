import { BlockCallData, MethodCallData } from "../call_data";
import { CallingConvention, ExecutionContext } from "../execution_context";
import { BlockFrame } from "../frame";
import { InstructionSequence } from "../instruction_sequence";
import { RValue, Class, NativeMethod, ObjectClass, Runtime, Module } from "../runtime";
import { Binding } from "./binding";
import { Object } from "../runtime/object";
import { Integer } from "./integer";
import { NameError } from "../errors";
import { Hash } from "./hash";

export abstract class Proc {
    public binding: Binding;
    public calling_convention: CallingConvention;

    static async from_native_fn(context: ExecutionContext, method: NativeMethod, binding?: Binding): Promise<RValue> {
        binding ||= context.get_binding();
        return new RValue(await this.klass(), new NativeProc(method, binding));
    }

    static async from_iseq(context: ExecutionContext, iseq: InstructionSequence, binding?: Binding): Promise<RValue> {
        binding ||= context.get_binding();
        return new RValue(await this.klass(), new InterpretedProc(iseq, binding));
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Proc");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Proc`);
        }

        return this.klass_;
    }

    abstract call(context: ExecutionContext, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: BlockCallData, owner?: Module): Promise<RValue>;
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

    async call(_context: ExecutionContext, args: RValue[], kwargs?: Hash, block?: RValue, _call_data?: BlockCallData, _owner?: Module): Promise<RValue> {
        return await this.callable(this.binding.self, args, kwargs, block);
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

    async call(context: ExecutionContext, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: BlockCallData, owner?: Module, frame_callback?: (frame: BlockFrame) => void): Promise<RValue> {
        call_data ||= BlockCallData.create(args.length);
        return await context.run_block_frame(call_data, this.calling_convention, this.iseq, this.binding, args, kwargs, block, owner, frame_callback);
    }

    with_binding(new_binding: Binding): InterpretedProc {
        return new InterpretedProc(this.iseq, new_binding, this.calling_convention);
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

    Runtime.define_class("Proc", ObjectClass, async (klass: Class) => {
        klass.define_native_method("call", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, call_data?: MethodCallData): Promise<RValue> => {
            const ec = ExecutionContext.current
            return await self.get_data<Proc>().call(ec, args, kwargs, block, call_data || (ec.frame as BlockFrame).call_data);
        });

        klass.define_native_method("arity", async (self: RValue): Promise<RValue> => {
            return await Integer.get(self.get_data<Proc>().arity);
        });

        await klass.alias_method("[]", "call");

        klass.define_native_method("to_proc", (self: RValue): RValue => {
            return self;
        });
    });

    inited = true;
};
