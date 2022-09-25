import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";

export default class Leave extends Instruction {
    call(_context: ExecutionContext) {
    }

    override does_branch(): boolean {
        return true;
    }

    override does_leave(): boolean {
        return true;
    }

    reads(): number {
        return 1;
    }

    writes(): number {
        return 0;
    }

    override has_side_effects(): boolean {
        // Leave doesn't really have a side effects... but we say it does so that
        // control flow has somewhere to end up.
        return true;
    }
}
