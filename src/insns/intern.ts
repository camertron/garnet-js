import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class Intern extends Instruction {
    private calldata_: MethodCallData;

    call(context: ExecutionContext): ExecutionResult {
        const obj = context.pop()!;
        const result = context.call_method(this.calldata, obj, []);
        context.push(result);
        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 1;
    }

    private get calldata() {
        if (this.calldata_) {
            return this.calldata_;
        } else {
            this.calldata_ = MethodCallData.create("to_sym", 0);
            return this.calldata_;
        }
    }
}
