import { ExecutionContext, ExecutionResult } from "./execution_context";
import { Float, Qfalse, Qnil, Qtrue, Runtime, RValue } from "./runtime";
import { Integer } from "./runtime/integer";
import { String } from "./runtime/string";

export type ValueType = {
    value: any,
    type: string
}

// Abstract base instruction.
export default abstract class Instruction {
    static to_ruby(object: ValueType): RValue {
        switch (object.type) {
            case "String":
                return String.new(object.value as string);
            case "Symbol":
                return Runtime.intern(object.value as string);
            case "Integer":
                return Integer.new(object.value as number);
            case "Float":
                return Float.new(object.value as number);
            case "TrueClass":
            case "FalseClass":
                return object.value as boolean ? Qtrue : Qfalse;
            case "NilClass":
                return Qnil;
            case "RValue":
                return object.value as RValue;
            default:
                throw new TypeError(`no implicit conversion of ${object.type} into Ruby object`);
        }
    }

    abstract call(context: ExecutionContext): ExecutionResult;

    // Whether or not this instruction is a branch instruction.
    does_branch(): boolean {
        return false;
    }

    // Whether or not this instruction leaves the current frame.
    does_leave(): boolean {
        return false;
    }

    // Whether or not this instruction falls through to the next instruction if
    // its branching fails.
    does_fall_through(): boolean {
      return false;
    }

    // This returns the number of values that are popped off the stack.
    pops(): number {
        return 0;
    }

    // This returns the number of values that are pushed onto the stack.
    pushes(): number {
        return 0;
    }

    // This returns the size of the instruction in terms of the number of slots
    // it occupies in the instruction sequence. Effectively this is 1 plus the
    // number of operands.
    length() {
        return 0;
    }

    // Does the instruction have side effects? Control-flow counts as a
    // side-effect, as do some special-case instructions like Leave
    has_side_effects(): boolean {
        return true;
    }
}
