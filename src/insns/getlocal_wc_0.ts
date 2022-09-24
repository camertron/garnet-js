import ExecutionContext from "../execution_context";
import Instruction from "../instruction";

export default class GetLocalWC0 extends Instruction {
    public name: string;
    public index: number;

    constructor(name: string, index: number) {
        super();

        this.name = name;
        this.index = index;
    }

    call(context: ExecutionContext) {
        const value = context.current_frame().get_local(this.index);
        context.stack.push(value);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
