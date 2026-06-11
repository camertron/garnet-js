import { InsnNode } from "../../instruction_list";
import TopN from "../topn";

/**
 * This is a node in the multi target state linked list. It tracks the
 * information for a particular target that necessarily has a parent expression.
 */
export class MultiTargetStateNode {
    // The pointer to the topn instruction that will need to be modified after
    // we know the total stack size of all of the targets.
    public topn: InsnNode<TopN> | null;

    // The index of the stack from the base of the entire multi target at which
    // the parent expression is located.
    public stack_index: number;

    // The number of slots in the stack that this node occupies.
    public stack_size: number;

    // The position of the node in the list of targets.
    public position: number;

    // A pointer to the next node in this linked list.
    public next: MultiTargetStateNode | null;

    constructor() {
        this.topn = null;
        this.stack_index = 0;
        this.stack_size = 0;
        this.position = 0;
        this.next = null;
    }
}

/**
 * As we're compiling a multi target, we need to track additional information
 * whenever there is a parent expression on the left hand side of the target.
 * This is because we need to go back and tell the expression where to fetch its
 * parent expression from the stack. We use a linked list of nodes to track this
 * information.
 */
export class MultiTargetState {
    // The total number of slots in the stack that this multi target occupies.
    public stack_size: number;

    // The position of the current node being compiled. This is forwarded to
    // nodes when they are allocated.
    public position: number;

    // A pointer to the head of this linked list.
    public head: MultiTargetStateNode | null;

    // A pointer to the tail of this linked list.
    public tail: MultiTargetStateNode | null;

    constructor() {
        this.stack_size = 0;
        this.position = 0;
        this.head = null;
        this.tail = null;
    }
};
