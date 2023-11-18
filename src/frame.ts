import { InstructionSequence } from "./instruction_sequence";
import { RValue, ObjectClass, Main } from "./runtime";

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
}

export class TopFrame extends Frame {
    constructor(iseq: InstructionSequence) {
        super(iseq, null, 0, Main, [ObjectClass])
    }
}

export class BlockFrame extends Frame {
    constructor(iseq: InstructionSequence, parent: Frame, stack_index: number) {
        super(iseq, parent, stack_index, parent.self, parent.nesting);
    }
}

export class MethodFrame extends Frame {
    public name: string;
    public block?: RValue;

    constructor(iseq: InstructionSequence, nesting: RValue[], parent: Frame, stack_index: number, self: RValue, name: string, block?: RValue) {
        super(iseq, parent, stack_index, self, nesting);
        this.name = name;
        this.block = block;
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
