import { BlockCallData, MethodCallData } from "./call_data";
import { CallingConvention, ExecutionContext } from "./execution_context";
import { InstructionSequence } from "./instruction_sequence";
import { RValue, ObjectClass, Main, RValuePointer, Module, Qnil } from "./runtime";
import { Binding } from "./runtime/binding";
import { Hash } from "./runtime/hash";

export interface IFrame {
    iseq: InstructionSequence;
    parent: Frame | null;
    stack_index: number;
    self: RValue;
    nesting: RValue[];
    svars: { [key: string]: RValue };
    line: number;
    pc: number;

    local_get(context: ExecutionContext, index: number, depth: number): RValue;
    local_set(context: ExecutionContext, index: number, depth: number, value: RValue): void;
}

export interface IFrameWithOwner extends IFrame {
    owner?: Module;
}

export class Frame implements IFrame {
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
        const stack_index = this.frame_at(context.frame!, depth)!.stack_index + index;
        const stack_entry = context.stack[stack_index];

        if (!stack_entry) {
            // initialize empty stack entries with nil
            context.stack[stack_index] = new RValuePointer(Qnil);
            return Qnil;
        }

        return stack_entry.rval;
    }

    local_set(context: ExecutionContext, index: number, depth: number, value: RValue) {
        const stack_index = this.frame_at(context.frame!, depth)!.stack_index + index;

        if (!context.stack[stack_index]) {
            context.stack[stack_index] = new RValuePointer(value);
        } else {
            context.stack[stack_index].rval = value;
        }
    }

    protected frame_at(starting_frame: Frame, depth: number): Frame | null {
        let current: Frame = starting_frame;

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

export class BlockFrame extends Frame implements IFrameWithOwner {
    public call_data: BlockCallData;
    public args: RValue[];
    public kwargs?: Hash;
    public calling_convention: CallingConvention;
    public binding: Binding;
    public original_stack: RValuePointer[];
    public owner?: Module;

    constructor(call_data: BlockCallData, calling_convention: CallingConvention, iseq: InstructionSequence, binding: Binding, original_stack: RValuePointer[], args: RValue[], kwargs?: Hash, block?: RValue, owner?: Module) {
        super(iseq, binding.parent_frame, binding.stack_index, binding.self, binding.nesting);

        this.call_data = call_data;
        this.calling_convention = calling_convention;
        this.binding = binding;
        this.original_stack = original_stack;
        this.args = args;
        this.kwargs = kwargs;
        this.owner = owner;
    }

    local_get(context: ExecutionContext, index: number, depth: number): RValue {
        let stack_index;

        if (depth > 0) {
            stack_index = this.frame_at(this.binding.parent_frame!, depth - 1)!.stack_index + index;
        } else {
            stack_index = context.frame!.stack_index + index;
        }

        const stack_entry = context.stack[stack_index];

        if (!stack_entry) {
            // initialize empty stack entries with nil
            context.stack[stack_index] = new RValuePointer(Qnil);
            return Qnil;
        }

        return stack_entry.rval;
    }

    local_set(context: ExecutionContext, index: number, depth: number, value: RValue) {
        let stack_index;

        if (depth > 0) {
            stack_index = this.frame_at(this.binding.parent_frame!, depth - 1)!.stack_index + index;
        } else {
            stack_index = context.frame!.stack_index + index;
        }

        if (!context.stack[stack_index]) {
            context.stack[stack_index] = new RValuePointer(value);
        } else {
            context.stack[stack_index].rval = value;
        }

        // The following code sets a local variable outside the context of the block.
        if (depth > 0 && this.binding.parent_frame == context.frame?.parent) {
            this.original_stack[stack_index].rval = value;
        }
    }
}

export class MethodFrame extends Frame implements IFrameWithOwner {
    public call_data: MethodCallData;
    public args: RValue[];
    public kwargs?: Hash;
    public block?: RValue;
    public owner?: Module;

    constructor(iseq: InstructionSequence, nesting: RValue[], parent: Frame, stack_index: number, self: RValue, call_data: MethodCallData, args: RValue[], kwargs?: Hash, block?: RValue, owner?: Module) {
        super(iseq, parent, stack_index, self, nesting);
        this.call_data = call_data;
        this.args = args;
        this.kwargs = kwargs;
        this.block = block;
        this.owner = owner;
    }
}

export class ClassFrame extends Frame implements IFrameWithOwner {
    public owner?: Module;

    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number, self: RValue, nesting?: RValue[]) {
        super(iseq, parent, stack_index, self, nesting || parent.nesting.concat([self]));
        // In a class/module body, the owner is the class/module being defined
        this.owner = self.get_data<Module>();
    }
}

export class RescueFrame extends Frame {
    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number) {
        super(iseq, parent, stack_index, parent.self, parent.nesting);
    }
}

export class EnsureFrame extends Frame {
    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number) {
        super(iseq, parent, stack_index, parent.self, parent.nesting);
    }
}
