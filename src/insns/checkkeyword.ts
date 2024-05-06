import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { RubyArray } from "../runtime/array";

export default class CheckKeyword extends Instruction {
    public keyword_bits_index: number;
    public keyword_index: number;

    constructor(keyword_bits_index: number, keyword_index: number) {
        super();

        this.keyword_bits_index = keyword_bits_index;
        this.keyword_index = keyword_index;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const keyword_bits = context.local_get(this.keyword_bits_index, 0);
        context.push(keyword_bits.get_data<RubyArray>().elements[this.keyword_index]);
        return null;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 3;
    }
}
