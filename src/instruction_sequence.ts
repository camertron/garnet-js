import CallData from "./call_data";
import BranchIf from "./insns/branchif";
import { BranchNil } from "./insns/branchnil";
import BranchUnless from "./insns/branchunless";
import DefineClass from "./insns/defineclass";
import DefineMethod from "./insns/definemethod";
import DefineSMethod from "./insns/definesmethod";
import Dup from "./insns/dup";
import GetConstant from "./insns/getconstant";
import GetInstanceVariable from "./insns/getinstancevariable";
import GetLocal from "./insns/getlocal";
import GetLocalWC0 from "./insns/getlocal_wc_0";
import GetLocalWC1 from "./insns/getlocal_wc_1";
import InvokeSuper from "./insns/invokesuper";
import { Jump } from "./insns/jump";
import Leave from "./insns/leave";
import NewArray from "./insns/new_array";
import NewHash from "./insns/newhash";
import Once from "./insns/once";
import Pop from "./insns/pop";
import PutNil from "./insns/putnil";
import PutObject from "./insns/putobject";
import PutObjectInt2Fix0 from "./insns/putobject_int2fix_0";
import PutObjectInt2Fix1 from "./insns/putobject_int2fix_1";
import PutSelf from "./insns/putself";
import PutSpecialObject, { SpecialObjectType } from "./insns/putspecialobject";
import PutString from "./insns/putstring";
import Send from "./insns/send";
import SetInstanceVariable from "./insns/setinstancevariable";
import SetLocal from "./insns/setlocal";
import SetLocalWC0 from "./insns/setlocal_wc_0";
import SetLocalWC1 from "./insns/setlocal_wc_1";
import Swap from "./insns/swap";
import Instruction, { ValueType } from "./instruction";
import { LocalTable, Lookup } from "./local_table";
import { Options } from "./options";
import { String as RubyString } from "./runtime";

class Node {
    public instruction: Instruction;
    public next_node: Node | null;

    constructor(instruction: Instruction, next_node: Node | null = null) {
        this.instruction = instruction;
        this.next_node = next_node;
    }
}

// When the list of instructions is first being created, it's stored as a
// linked list. This is to make it easier to perform peephole optimizations
// and other transformations like instruction specialization.
class InstructionList {
    public head_node: Node | null;
    public tail_node: Node | null;

    constructor() {
        this.head_node = null;
        this.tail_node = null;
    }

    each(cb: (instruction: Instruction) => void) {
        this.each_node((node: Node) => {
            cb(node.instruction);
        });
    }

    each_node(cb: (node: Node) => void) {
        let node = this.head_node;

        while (node) {
            cb(node);
            node = node.next_node;
        }
    }

    push(instruction: Instruction) {
        let node = new Node(instruction)

        if (this.head_node == null) {
            this.head_node = node;
            this.tail_node = node;
        } else {
            this.tail_node!.next_node = node
            this.tail_node = node
        }

        return node;
    }

    to_array(): Instruction[] {
        const result: Instruction[] = [];
        this.each(instruction => result.push(instruction));
        return result;
    }
}

// This represents the destination of instructions that jump. Initially it
// does not track its position so that when we perform optimizations the
// indices don't get messed up.
export class Label {
    public name: string | null;

    // When we're serializing the instruction sequence, we need to be able to
    // look up the label from the branch instructions and then access the
    // subsequent node. So we'll store the reference here.
    public node: Node;

    constructor(name: string | null = null) {
        this.name = name;
    }

    patch(name: string) {
        this.name = name;
    }

    equals(other: Label) {
        return other instanceof Label && this.name == other.name;
    }
}

// This object is used to track the size of the stack at any given time. It
// is effectively a mini symbolic interpreter. It's necessary because when
// instruction sequences get serialized they include a :stack_max field on
// them. This field is used to determine how much stack space to allocate
// for the instruction sequence.
class Stack {
    public current_size: number;
    public maximum_size: number;

    constructor() {
        this.current_size = 0;
        this.maximum_size = 0;
    }

    change_by(value: number) {
        this.current_size += value;

        if (this.current_size > this.maximum_size) {
            this.maximum_size = this.current_size;
        }
    }
}

export class CatchEntry {
    public iseq: InstructionSequence | null;
    public begin_label: Label;
    public end_label: Label;
    public exit_label: Label;
    public restore_sp: number;

    constructor(iseq: InstructionSequence | null, begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.iseq = iseq;
        this.begin_label = begin_label;
        this.end_label = end_label;
        this.exit_label = exit_label;
        this.restore_sp = restore_sp;
    }
}

export class CatchBreak extends CatchEntry {
}

export class CatchEnsure extends CatchEntry {
}

export class CatchNext extends CatchEntry {
}

export class CatchRedo extends CatchEntry {
}

export class CatchRescue extends CatchEntry {
}

export class CatchRetry extends CatchEntry {
}

type ArgumentOptions = {
    lead_num: number,
    opt: Label[],
    rest_start: number,
    post_start: number,
    post_num: number,
    block_start: boolean
}

export class InstructionSequence {
    public name: string;
    public file: string;
    public line: number;
    public type: string;
    public parent_iseq: InstructionSequence | null;
    public options: Options

    public argument_size: number;
    public argument_options: ArgumentOptions;
    public catch_table: CatchEntry[];
    public local_table: LocalTable;
    public inline_storages: any;
    public insns: InstructionList;
    public compiled_insns: (Instruction | number | string | Label)[];
    public storage_index: number;
    public stack: Stack;

    constructor(name: string, file: string, line: number, type: string, parent_iseq: InstructionSequence | null = null, options: Options) {
        this.name = name;
        this.file = file;
        this.line = line;
        this.type = type;
        this.parent_iseq = parent_iseq;

        this.argument_size = 0;
        this.catch_table = [];

        this.argument_options = {
            lead_num: 0,
            opt: [],
            rest_start: 0,
            post_start: 0,
            post_num: 0,
            block_start: false
        };

        this.local_table = new LocalTable();
        this.inline_storages = {};
        this.insns = new InstructionList();
        this.storage_index = 0;
        this.stack = new Stack()

        this.options = options;
    }

    label() {
        return new Label();
    }

    putnil() {
        this.push(new PutNil());
    }

    putstring(str: string) {
        this.push(new PutString(RubyString.new(str)));
    }

    leave() {
        this.push(new Leave());
    }

    putself() {
        this.push(new PutSelf());
    }

    putobject(object: ValueType) {
        if (this.options.operands_unification) {
            if (object.value === 0) {
                this.push(new PutObjectInt2Fix0());
            } else if (object.value === 1) {
                this.push(new PutObjectInt2Fix1());
            } else {
                this.push(new PutObject(object));
            }
        } else {
            this.push(new PutObject(object));
        }
    }

    getlocal(index: number, depth: number) {
        if (this.options.operands_unification) {
            // Specialize the getlocal instruction based on the depth of the
            // local variable. If it's 0 or 1, then there's a specialized
            // instruction that will look at the current scope or the parent
            // scope, respectively, and requires fewer operands.
            switch (depth) {
                case 0:
                    this.push(new GetLocalWC0(index));
                    break;

                case 1:
                    this.push(new GetLocalWC1(index));
                    break;

                default:
                    this.push(new GetLocal(index, depth));
            }
        } else {
            this.push(new GetLocal(index, depth));
        }
    }

    setlocal(index: number, depth: number) {
        if (this.options.operands_unification) {
            // Specialize the setlocal instruction based on the depth of the
            // local variable. If it's 0 or 1, then there's a specialized
            // instruction that will write to the current scope or the parent
            // scope, respectively, and requires fewer operands.
            switch (depth) {
                case 0:
                    this.push(new SetLocalWC0(index));
                    break;

                case 1:
                    this.push(new SetLocalWC1(index));
                    break;

                default:
                    this.push(new SetLocal(index, depth));
            }
        } else {
            this.push(new SetLocal(index, depth));
        }
    }

    setinstancevariable(name: string) {
        // @TODO figure out inline storage
        this.push(new SetInstanceVariable(name, 0));
    }

    getinstancevariable(name: string) {
        // @TODO figure out inline storage
        this.push(new GetInstanceVariable(name, 0))
    }

    newarray(size: number) {
        this.push(new NewArray(size));
    }

    branchnil(label: Label) {
        this.push(new BranchNil(label));
    }

    branchif(label: Label) {
        this.push(new BranchIf(label));
    }

    branchunless(label: Label) {
        this.push(new BranchUnless(label));
    }

    dup() {
        this.push(new Dup());
    }

    pop() {
        this.push(new Pop());
    }

    jump(label: Label) {
        this.push(new Jump(label));
    }

    send(calldata: CallData, block_iseq: InstructionSequence | null) {
        this.push(new Send(calldata, block_iseq));
    }

    definemethod(name: string, method_iseq: InstructionSequence) {
        this.push(new DefineMethod(name, method_iseq));
    }

    definesmethod(name: string, method_iseq: InstructionSequence) {
        this.push(new DefineSMethod(name, method_iseq));
    }

    defineclass(name: string, iseq: InstructionSequence, flags: number) {
        this.push(new DefineClass(name, iseq, flags));
    }

    getconstant(name: string) {
        this.push(new GetConstant(name));
    }

    newhash(length: number) {
        this.push(new NewHash(length));
    }

    swap() {
        this.push(new Swap());
    }

    push(value: any): any {
        const node = this.insns.push(value);

        if (value.constructor == Array || value.constructor == Number || value.constructor == String) {
          return value;
        } else if (value instanceof Label) {
          value.node = node;
          return value;
        } else {
          this.stack.change_by(-value.pops + value.pushes)
          return value
        }
    }

    local_variable(name: string, depth: number = 0): Lookup | null {
        const lookup = this.local_table.find(name, depth);

        if (lookup) {
            return lookup;
        } else if (this.parent_iseq) {
            return this.parent_iseq.local_variable(name, depth + 1);
        } else {
            return null;
        }
    }

    putspecialobject(type: SpecialObjectType) {
        this.push(new PutSpecialObject(type));
    }

    private child_iseq(name: string, line: number, type: string): InstructionSequence {
        return new InstructionSequence(name, this.file, line, type, this, this.options);
    }

    method_child_iseq(name: string, line: number) {
        return this.child_iseq(name, line, "method");
    }

    block_child_iseq(line: number): InstructionSequence {
        let current: InstructionSequence = this;

        while (current.type == "block") {
            // @ts-ignore
            current = current.parent_iseq;
        }

        return this.child_iseq(`block in ${current.name}`, line, "block");
    }

    class_child_iseq(name: string, line: number): InstructionSequence {
        return this.child_iseq(`<class:${name}>`, line, "class");
    }

    compile() {
        // @TODO: optimizations and specializations

        this.catch_table.forEach((catch_entry) => {
            if (!(catch_entry instanceof CatchBreak) && catch_entry.iseq) {
                catch_entry.iseq.compile();
            }
        });

        let length = 0;

        this.insns.each((insn) => {
            if (insn instanceof Label) {
                insn.patch(`label_${length}`);
            } else if (insn instanceof DefineClass) {
                insn.iseq.compile();
                length += insn.length();
            } else if (insn instanceof DefineMethod || insn instanceof DefineSMethod) {
                insn.iseq.compile!()
                length += insn.length();
            } else if (insn instanceof InvokeSuper || insn instanceof Send) {
                if (insn.block_iseq) {
                    insn.block_iseq.compile();
                }

                length += insn.length();
            } else if (insn instanceof Once) {
                insn.iseq.compile();
                length += insn.length();
            } else {
                length += insn.length();
            }
        });

        this.compiled_insns = this.insns.to_array();
    }

    public catch_break(iseq: InstructionSequence, begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchBreak(
                iseq,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }

    private catch_ensure(iseq: InstructionSequence, begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchEnsure(
                iseq,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }

    private catch_next(begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchNext(
                null,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }

    private catch_redo(begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchRedo(
                null,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }

    private catch_rescue(iseq: InstructionSequence, begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchRescue(
                iseq,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }

    private catch_retry(begin_label: Label, end_label: Label, exit_label: Label, restore_sp: number) {
        this.catch_table.push(
            new CatchRetry(
                null,
                begin_label,
                end_label,
                exit_label,
                restore_sp
            )
        );
    }
}
