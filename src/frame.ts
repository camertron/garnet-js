import { NameError } from "./errors";
import { InstructionSequence } from "./instruction_sequence";
import { RValue, Qnil } from "./runtime";

export default class Frame {
    public selfo: RValue;
    public iseq: InstructionSequence;
    public locals: RValue[];
    public block?: RValue;

    constructor(selfo: RValue, iseq: InstructionSequence) {
        this.selfo = selfo;
        this.iseq = iseq;
        this.locals = Array(iseq.locals().length).fill(Qnil);
    }

    get_local(index: number): RValue {
        const local = this.locals[index];

        if (local == Qnil) {
            throw new NameError(`undefined local variable or method \`${this.iseq.locals()[index]} for ${this.selfo}`);
        }

        return local;
    }

    set_local(index: number, value: RValue) {
        this.locals[index] = value;
    }

    set_block(block: RValue) {
        this.block = block;
    }
}
