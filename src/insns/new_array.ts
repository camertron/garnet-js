import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { Array } from "../runtime/array";

export default class NewArray extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    call(context: ExecutionContext) {
        const elements = context.stack.splice(context.stack.length - this.size, this.size);
        context.stack.push(Array.new(elements));
    }

    reads(): number {
        return this.size;
    }

    writes(): number {
        return 1;
    }
}
