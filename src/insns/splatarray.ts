import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil, RValue } from "../runtime";
import { Object } from "../runtime/object";
import { TypeError } from "../errors";
import { RubyArray } from "../runtime/array";

export default class SplatArray extends Instruction {
    private flag: boolean;

    constructor(flag: boolean) {
        super();
        this.flag = flag;
    }

    call(context: ExecutionContext): ExecutionResult {
        const value = context.pop()!;
        let arr: RValue;

        if (value.klass === RubyArray.klass) {
            arr = RubyArray.new([...value?.get_data<RubyArray>().elements]);
        } else if (value === Qnil) {
            arr = RubyArray.new([]);
        } else {
            if (Object.respond_to(value, "to_a")) {
                const result = Object.send(value, "to_a");

                if (result === Qnil) {
                    arr = RubyArray.new([value]);
                } else if (result.klass !== RubyArray.klass) {
                    throw new TypeError("expected to_a to return an Array");
                } else {
                    arr = result;
                }
            } else {
                arr = RubyArray.new([value]);
            }
        }

        context.push(arr);

        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}
