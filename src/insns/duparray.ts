import { Array } from "../runtime";
import { ExecutionContext } from "../execution_context";
import Instruction, { ValueType } from "../instruction";
import { RValue } from "../runtime";

export default class DupArray extends Instruction {
    public values: RValue[];

    constructor(values: any[]) {
        super();

        this.values = values.map( (val: ValueType) => {
            return Instruction.to_ruby(val);
        });
    }

    call(context: ExecutionContext) {
        context.stack.push(Array.new([...this.values]));
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
