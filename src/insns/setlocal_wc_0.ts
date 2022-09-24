import ExecutionContext from "../execution_context";
import Instruction from "../instruction";

export default class SetLocalWC0 extends Instruction {
    public name: string;
    public index: number;

    constructor(name: string, index: number) {
        super();

        this.name = name;
        this.index = index;
    }

    call(context: ExecutionContext) {
        const value = context.stack.pop()!;
        context.current_frame().set_local(this.index, value);
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }
}
