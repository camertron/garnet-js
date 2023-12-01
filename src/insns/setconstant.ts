import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Module } from "../runtime";

export default class SetConstant extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    call(context: ExecutionContext): ExecutionResult {
        const parent = context.stack.pop()!;
        const value = context.stack.pop()!;

        parent.get_data<Module>().constants[this.name] = value;

        return null;
    }

    pops(): number {
        return 2;
    }

    number(): number {
        return 2;
    }
}
