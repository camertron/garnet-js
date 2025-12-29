import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { Object } from "../runtime/object"
import { RubyArray } from "../runtime/array";

export enum ExpandArrayFlag {
    SPLAT_FLAG = 0x01,
    POSTARG_FLAG = 0x02
}

export default class ExpandArray extends Instruction {
    public size: number;
    public flags: number;

    constructor(size: number, flags: number) {
        super();

        this.size = size;
        this.flags = flags;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        let object = context.pop()!;

        if (object.klass == await RubyArray.klass()) {
            // dup
            object = await RubyArray.new([...object.get_data<RubyArray>().elements]);
        } else if ((await Object.send(object, "respond_to?", [await Runtime.intern("to_ary"), Qtrue])).is_truthy()) {
            object = await Object.send(object, "to_ary");
        } else {
            object = await RubyArray.new([object]);
        }

        const splat_flag = this.has_splat_flag;
        const postarg_flag = this.has_postarg_flag;
        const obj_data = object.get_data<RubyArray>().elements;

        if (this.size === 0 && !splat_flag) {
            // no space left on stack
        } else if (postarg_flag) {
            const values: RValue[] = [];

            if (this.size > obj_data.length) {
                for (let i = 0; i < this.size - obj_data.length; i ++) {
                    values.push(Qnil);
                }
            }

            const times = Math.min(this.size, obj_data.length);

            for (let i = 0; i < times; i ++) {
                values.push(obj_data.pop()!);
            }

            if (splat_flag) {
                values.push(object);
            }

            values.forEach((item) => context.push(item));
        } else {
            const values = [];
            const times = Math.min(this.size, obj_data.length)

            for (let i = 0; i < times; i ++) {
                values.push(obj_data.shift());
            }

            if (this.size > values.length) {
                const values_len = values.length;

                for (let i = 0; i < this.size - values_len; i ++) {
                    values.push(Qnil);
                }
            }

            if (splat_flag) {
                values.push(object)
            }

            for (let i = values.length - 1; i >= 0; i --) {
                context.push(values[i]!);
            }
        }

        return null;
    }

    private get has_splat_flag(): boolean {
        return (this.flags & ExpandArrayFlag.SPLAT_FLAG) > 0;
    }

    private get has_postarg_flag(): boolean {
        return (this.flags & ExpandArrayFlag.POSTARG_FLAG) > 0;
    }

    length(): number {
        return 3;
    }

    pushes(): number {
        return this.size + (this.has_splat_flag ? 1 : 0);
    }

    pops(): number {
        return 1;
    }
}
