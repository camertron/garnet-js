import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class AdjustStack extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.popn(this.size);
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return this.size;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("adjuststack", [fmt.object(this.size)]);
    }
}
