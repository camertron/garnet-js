import { ExecutionContext, ExecutionResult } from "../execution_context";
import { Array, Qfalse } from "../runtime";
import Instruction from "../instruction";

export default class CheckKeyword extends Instruction {
    public keyword_bits_index: number;
    public keyword_index: number;

    constructor(keyword_bits_index: number, keyword_index: number) {
        super();

        this.keyword_bits_index = keyword_bits_index;
        this.keyword_index = keyword_index;
    }

    call(context: ExecutionContext): ExecutionResult {
        const keyword_bits = context.local_get(this.keyword_bits_index, 0);
        context.push(keyword_bits.get_data<Array>().elements[this.keyword_index]);
        return null;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 3;
    }
}
