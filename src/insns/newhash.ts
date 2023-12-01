import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Hash } from "../runtime";

export default class NewHash extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    call(context: ExecutionContext): ExecutionResult {
        const elements = context.stack.splice(context.stack.length - this.size, this.size);
        const hash_rvalue = Hash.new();
        const hash = hash_rvalue.get_data<Hash>();

        for (let i = 0; i < elements.length; i += 2) {
            hash.set(elements[i], elements[i + 1]);
        }

        context.stack.push(hash_rvalue);
        return null;
    }

    pops(): number {
        return this.size;
    }

    pushes(): number {
        return 1;
    }

    number(): number {
        return 2;
    }
}
