import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Hash } from "../runtime/hash";

export default class NewHash extends Instruction {
    public size: number;

    constructor(size: number) {
        super();

        this.size = size;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const elements = context.popn(this.size);
        const hash_rvalue = await Hash.new();
        const hash = hash_rvalue.get_data<Hash>();

        for (let i = 0; i < elements.length; i += 2) {
            await hash.set(elements[i], elements[i + 1]);
        }

        context.push(hash_rvalue);
        return null;
    }

    pops(): number {
        return this.size;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}
