import { NotImplementedError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export enum GetSpecialType {
    LASTLINE = 0,       // $_
    BACKREF = 1,        // $&
    FLIPFLOP_START = 2  // flipflop
}

export default class GetSpecial extends Instruction {
    public type: GetSpecialType;
    public number: number;

    constructor(type: GetSpecialType, number: number) {
        super();

        this.type = type;
        this.number = number;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        switch (this.type) {
            case GetSpecialType.LASTLINE:
                throw new NotImplementedError("getspecial LASTLINE");

            case GetSpecialType.BACKREF:
                context.push(context.frame_svar()!.svars["$&"] || Qnil);
                break;

            case GetSpecialType.FLIPFLOP_START:
                context.push(context.frame_svar()!.svars[GetSpecialType.FLIPFLOP_START] || Qnil);
                break;
        }

        return null;
    }

    length(): number {
        return 3;
    }

    pushes(): number {
        return 1;
    }
}
