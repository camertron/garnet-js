import { RubyArray } from "../runtime/array";
import { ExecutionContext, ExecutionResult } from "../execution_context";
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

    call(context: ExecutionContext): ExecutionResult {
        context.push(RubyArray.new([...this.values]));
        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}
