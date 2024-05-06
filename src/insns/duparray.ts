import { RubyArray } from "../runtime/array";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction, { ValueType } from "../instruction";
import { RValue } from "../runtime";

export default class DupArray extends Instruction {
    public orig_values: any[];
    private values_: RValue[];

    constructor(values: any[]) {
        super();

        this.orig_values = values;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        context.push(await RubyArray.new([...await this.values()]));
        return null;
    }

    private async values(): Promise<RValue[]> {
        if (!this.values_) {
            this.values_ = await Promise.all(
                this.orig_values.map((val: ValueType) => {
                    return Instruction.to_ruby(val);
                })
            )
        }

        return this.values_;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}
