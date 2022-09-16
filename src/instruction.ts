import ExecutionContext from "./execution_context";

// Abstract base instruction.
export default abstract class Instruction {
    abstract call(context: ExecutionContext): void;

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

    // How many values are read from the stack.
    abstract reads(): number;

    // How many values are written to the stack.
    abstract writes(): number;

    // Does the instruction have side effects? Control-flow counts as a
    // side-effect, as do some special-case instructions like Leave
    has_side_effects(): boolean {
        return true;
    }
}
