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
        const receiver = context.stack.pop()!;
        const result = context.call_method(this.calldata, receiver, []);
        context.stack.push(result);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 1;
    }

    number(): number {
        return 2;
    }
}
