import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Object } from "../runtime/object"

export default class ObjToString extends Instruction {
    public calldata: MethodCallData;

    constructor(calldata: MethodCallData) {
        super();

        this.calldata = calldata;
    }

    call(context: ExecutionContext): ExecutionResult {
        const receiver = context.pop()!;
        const result = Object.send(receiver, this.calldata);
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
}
