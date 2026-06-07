import { BlockCallData } from "../call_data";
import { Disassembler } from "../disassembler";
import { CallingConvention, ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";

export default class Once extends Instruction {
    public iseq: InstructionSequence;
    private executed: boolean = false;

    constructor(iseq: InstructionSequence) {
        super();

        this.iseq = iseq;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        if (this.executed) return null;

        context.push(
            await context.run_block_frame(
                BlockCallData.create(0), CallingConvention.BLOCK_PROC, this.iseq, context.get_binding(), []
            )
        );

        this.executed = true;

        return null;
    }

    length(): number {
        return 3;
    }

    pushes(): number {
        return 1;
    }

    disasm(fmt: Disassembler): string {
        fmt.enqueue(this.iseq);

        return fmt.instruction("once", [
            this.iseq.name
        ]);
    }
}
