import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class ObjToString extends Instruction {
    public calldata: MethodCallData;

    constructor(calldata: MethodCallData) {
        super();

        this.calldata = calldata;
    }

    call(context: ExecutionContext): ExecutionResult {
        const receiver = context.pop()!;
        const result = context.call_method(this.calldata, receiver, []);
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
