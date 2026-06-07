import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetLocal extends Instruction {
    public index: number;
    public depth: number;

    constructor(index: number, depth: number) {
        super();

        this.index = index;
        this.depth = depth;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const value = context.pop()!;
        context.local_set(this.index, this.depth, value);
        return null;
    }

    pops(): number {
        return 1;
    }

    length(): number {
        return 2;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("setlocal", [
            fmt.local(this.index, this.depth)
        ]);
    }
}
