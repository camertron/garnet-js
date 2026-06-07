import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import SetLocal from "./setlocal";

export default class SetLocalWC0 extends Instruction {
    public index: number;

    constructor(index: number) {
        super();

        this.index = index;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        return new SetLocal(this.index, 0).call(context);
    }

    pops(): number {
        return 1;
    }

    length(): number {
        return 2;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("setlocal_WC_0", [
            fmt.local(this.index, 0, 0)
        ]);
    }
}
