import { NotImplementedError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";
import { MatchData } from "../runtime/regexp";
import { RubyString } from "../runtime/string";

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
                // If number is 0, return $& (the entire match)
                // If number > 0, return $1, $2, etc (capture groups)
                // Compiler shifts number left by 1, so we need to shift it back.
                const capture_index = this.number >> 1;

                if (capture_index === 0) {
                    // $& (entire match)
                    context.push(context.frame_svar()!.svars["$&"] || Qnil);
                } else {
                    // $1, $2, etc (capture groups)
                    const match_data_rval = context.frame_svar()!.svars["$~"];

                    if (!match_data_rval || match_data_rval === Qnil) {
                        context.push(Qnil);
                        return null;
                    }

                    // get the capture group
                    const match_data = match_data_rval.get_data<MatchData>();

                    if (!match_data || capture_index >= match_data.captures.length) {
                        context.push(Qnil);
                        return null;
                    }

                    const [begin, end] = match_data.captures[capture_index];

                    // -1 means the capture group didn't match
                    if (begin === -1 || end === -1) {
                        context.push(Qnil);
                    } else {
                        const captured_str = match_data.str.slice(begin, end);
                        context.push(await RubyString.new(captured_str));
                    }
                }

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
