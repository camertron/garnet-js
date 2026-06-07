import { MethodCallData } from "../call_data";
import { Disassembler } from "../disassembler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Object } from "../runtime/object"
import { RubyString } from "../runtime/string"

export default class ObjToString extends Instruction {
    public calldata: MethodCallData;

    constructor(calldata: MethodCallData) {
        super();

        this.calldata = calldata;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const receiver = context.pop()!;
        const result = await Object.send(receiver, this.calldata);
        context.push(result);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("objtostring", [
            fmt.calldata(this.calldata)
        ]);
    }
}
