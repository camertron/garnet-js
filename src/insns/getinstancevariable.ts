import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class GetInstanceVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(
            context.frame!.self.iv_get(this.name)
        );

        return null;
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction(
            "getinstancevariable", [
                fmt.object(this.name)
            ]
        );
    }
}
