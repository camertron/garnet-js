import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, Qfalse, Qtrue, RValue } from "../runtime";
import { RubyArray } from "../runtime/array";
import { MethodCallData } from "../call_data";
import { Object } from "../runtime/object";

export enum CheckMatchType {
    TYPE_WHEN = 1,
    TYPE_CASE = 2,
    TYPE_RESCUE = 3,
    ARRAY_SPLAT = 4
}

export default class CheckMatch extends Instruction {
    public flag: number;

    private static triple_equals_call_data = MethodCallData.create("===", 1);

    constructor(flag: number) {
        super();
        this.flag = flag;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        // stack order: [..., target, pattern]
        const pattern = context.pop()!;
        const target = context.pop()!;

        const type = this.flag & 0x03;  // lower 2 bits
        const is_splat = (this.flag & CheckMatchType.ARRAY_SPLAT) !== 0;

        let result: RValue;

        if (is_splat) {
            // when we have `when *array`, we need to check if target matches any element in the array
            if (pattern.klass !== await RubyArray.klass()) {
                const class_name = pattern.klass.get_data<Class>().name;
                throw new Error(`checkmatch with ARRAY_SPLAT flag requires an array, got ${class_name}`);
            }

            const array = pattern.get_data<RubyArray>();
            let matched = false;

            for (const element of array.elements) {
                const match_result = await Object.send(element, CheckMatch.triple_equals_call_data, [target]);

                if (match_result.is_truthy()) {
                    matched = true;
                    break;
                }
            }

            result = matched ? Qtrue : Qfalse;
        } else {
            // normal case: compare via `#===`
            switch (type) {
                case CheckMatchType.TYPE_WHEN:
                    // for TYPE_WHEN, just check if pattern is truthy
                    result = pattern.is_truthy() ? Qtrue : Qfalse;
                    break;

                case CheckMatchType.TYPE_CASE:
                case CheckMatchType.TYPE_RESCUE:
                    // for TYPE_CASE and TYPE_RESCUE, call `#===` on pattern with target
                    const call_data = MethodCallData.create("===", 1);
                    result = await Object.send(pattern, call_data, [target]);
                    break;

                default:
                    throw new Error(`Unknown checkmatch type: ${type}`);
            }
        }

        context.push(result);
        return null;
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}

