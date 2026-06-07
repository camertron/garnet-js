import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetInstanceVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const value = context.pop()!;
        context.frame!.self.iv_set(this.name, value);
        return null;
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction(
            "setinstancevariable", [
                fmt.object(this.name)
            ]
        );
    }
}
