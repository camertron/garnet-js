import ExecutionContext from "../execution_context";
import Instruction from "../instruction";

export default class Pop extends Instruction {
    call(context: ExecutionContext) {
        context.stack.pop();
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }
}
