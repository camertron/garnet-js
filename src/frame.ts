import { BlockCallData, MethodCallData } from "./call_data";
import { CallingConvention, ExecutionContext } from "./execution_context";
import { InstructionSequence } from "./instruction_sequence";
import { RValue, ObjectClass, Main, Module, Kwargs } from "./runtime";
import { Binding } from "./runtime/binding";

export class Frame {
    public iseq: InstructionSequence;
    public parent: Frame | null;
    public stack_index: number;
    public self: RValue;
    public nesting: RValue[];
    public svars: { [key: string]: RValue };
    public line: number;
    public pc: number;

    constructor(iseq: InstructionSequence, parent: Frame | null, stack_index: number, self: RValue, nesting: RValue[]) {
        this.iseq = iseq;
        this.parent = parent;
        this.stack_index = stack_index;
        this.self = self;
        this.nesting = nesting;

        this.svars = {};
        this.line = iseq.line;
        this.pc = 0;
    }

    local_get(context: ExecutionContext, index: number, depth: number): RValue {
        return context.stack[this.frame_at(context, depth)!.stack_index + index];
    }

    local_set(context: ExecutionContext, index: number, depth: number, value: RValue) {
        context.stack[this.frame_at(context, depth)!.stack_index + index] = value;
    }

    protected frame_at(context: ExecutionContext, depth: number): Frame | null {
        let current: Frame = context.frame!;

        for (let i = 0; i < depth; i ++) {
            if (!current.parent) {
                return null;
            }

            current = current.parent;
        }

        return current;
    }
}

export class TopFrame extends Frame {
    constructor(iseq: InstructionSequence, stack_index: number = 0) {
        super(iseq, null, stack_index, Main, [ObjectClass]);
    }
}

export class BlockFrame extends Frame {
    public call_data: BlockCallData;
    public calling_convention: CallingConvention;
    private binding: Binding;
    private original_stack: RValue[];

    constructor(call_data: BlockCallData, calling_convention: CallingConvention, iseq: InstructionSequence, binding: Binding, original_stack: RValue[]) {
        super(iseq, binding.parent_frame, binding.stack_index, binding.self, binding.nesting);

        this.call_data = call_data;
        this.calling_convention = calling_convention;
        this.binding = binding;
        this.original_stack = original_stack;
    }

    local_set(context: ExecutionContext, index: number, depth: number, value: RValue) {
        const stack_index = this.frame_at(context, depth)!.stack_index + index;
        this.binding.stack[stack_index] = value;

        // The following code sets a local variable outside the context of the block.
        if (depth > 0 && this.binding.parent_frame == context.frame?.parent) {
            this.original_stack[stack_index] = value;
        }
    }
}

export class MethodFrame extends Frame {
    public call_data: MethodCallData;
    public args: RValue[];
    public kwargs?: Kwargs;
    public block?: RValue;
    public owner?: RValue;

    constructor(iseq: InstructionSequence, nesting: RValue[], parent: Frame, stack_index: number, self: RValue, call_data: MethodCallData, args: RValue[], kwargs?: Kwargs, block?: RValue, owner?: RValue) {
        super(iseq, parent, stack_index, self, nesting);
        this.call_data = call_data;
        this.args = args;
        this.kwargs = kwargs;
        this.block = block;
        this.owner = owner;
    }
}

export class ClassFrame extends Frame {
    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number, self: RValue) {
        super(iseq, parent, stack_index, self, parent.nesting.concat([self]));
    }
}

export class RescueFrame extends Frame {
    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number) {
        super(iseq, parent, stack_index, parent.self, parent.nesting);
    }
}
