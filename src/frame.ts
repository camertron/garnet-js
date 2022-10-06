import { NameError } from "./errors";
import { InstructionSequence } from "./instruction_sequence";
import { RValue, Object } from "./runtime";

export default class Frame {
    public selfo: RValue;
    public iseq: InstructionSequence;
    public locals: RValue[];
    public block?: RValue;

    constructor(selfo: RValue, iseq: InstructionSequence) {
        this.selfo = selfo;
        this.iseq = iseq;
        this.locals = Array(iseq.locals().length).fill(null);
    }

    get_local(index: number): RValue {
        const local = this.locals[index];

        // it's unclear if this would ever actually happen, since the iseq that calls get_local()
        // knows exactly which locals exist in the current scope
        if (local == null) {
            throw new NameError(`undefined local variable or method \`${this.iseq.locals()[index]}' for ${Object.send(this.selfo, "inspect").get_data<string>()}`);
        }

        return this.locals[index];
    }

    set_local(index: number, value: RValue) {
        this.locals[index] = value;
    }

    set_block(block: RValue) {
        this.block = block;
    }
}
