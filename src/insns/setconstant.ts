import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Module } from "../runtime";

export default class SetConstant extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const parent = context.pop()!;
        const value = context.pop()!;

        parent.get_data<Module>().constants[this.name] = value;

        return null;
    }

    pops(): number {
        return 2;
    }

    length(): number {
        return 2;
    }
}
