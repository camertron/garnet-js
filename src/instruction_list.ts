import { BlockCallData, MethodCallData } from "./call_data";
import { LexicalScope } from "./compiler";
import { ThrowType } from "./execution_context";
import AdjustStack from "./insns/adjuststack";
import AnyToString from "./insns/any_to_string";
import BranchIf from "./insns/branchif";
import { BranchNil } from "./insns/branchnil";
import BranchUnless from "./insns/branchunless";
import CheckKeyword from "./insns/checkkeyword";
import CheckMatch from "./insns/checkmatch";
import ConcatStrings from "./insns/concat_strings";
import ConcatArray from "./insns/concatarray";
import DefineClass from "./insns/defineclass";
import Defined, { DefinedType } from "./insns/defined";
import DefineMethod from "./insns/definemethod";
import DefineSMethod from "./insns/definesmethod";
import Dup from "./insns/dup";
import DupN from "./insns/dupn";
import ExpandArray from "./insns/expandarray";
import GetGlobal from "./insns/get_global";
import GetBlockParamProxy from "./insns/getblockparamproxy";
import GetClassVariable from "./insns/getclassvariable";
import GetConstant from "./insns/getconstant";
import GetInstanceVariable from "./insns/getinstancevariable";
import GetLocal from "./insns/getlocal";
import GetLocalWC0 from "./insns/getlocal_wc_0";
import GetLocalWC1 from "./insns/getlocal_wc_1";
import GetSpecial, { GetSpecialType } from "./insns/getspecial";
import Intern from "./insns/intern";
import InvokeBlock from "./insns/invokeblock";
import InvokeSuper from "./insns/invokesuper";
import { Jump } from "./insns/jump";
import Leave from "./insns/leave";
import NewArray from "./insns/new_array";
import NewHash from "./insns/newhash";
import NewRange from "./insns/newrange";
import ObjToString from "./insns/obj_to_string";
import OptMult from "./insns/opt_mult";
import OptPlus from "./insns/opt_plus";
import OptSendWithoutBlock from "./insns/opt_send_without_block";
import Pop from "./insns/pop";
import PutNil from "./insns/putnil";
import PutObject from "./insns/putobject";
import PutObjectInt2Fix0 from "./insns/putobject_int2fix_0";
import PutObjectInt2Fix1 from "./insns/putobject_int2fix_1";
import PutSelf from "./insns/putself";
import PutSpecialObject, { SpecialObjectType } from "./insns/putspecialobject";
import PutString from "./insns/putstring";
import Send from "./insns/send";
import SetGlobal from "./insns/set_global";
import SetClassVariable from "./insns/setclassvariable";
import SetConstant from "./insns/setconstant";
import SetInstanceVariable from "./insns/setinstancevariable";
import SetLocal from "./insns/setlocal";
import SetLocalWC0 from "./insns/setlocal_wc_0";
import SetLocalWC1 from "./insns/setlocal_wc_1";
import SetN from "./insns/setn";
import SplatArray from "./insns/splatarray";
import Swap from "./insns/swap";
import Throw from "./insns/throw";
import TopN from "./insns/topn";
import ToRegexp from "./insns/toregexp";
import Instruction, { ValueType } from "./instruction";
import { InstructionSequence, Label } from "./instruction_sequence";
import { Module, ObjectClass, RValue } from "./runtime";
import { ParameterMetadata } from "./runtime/parameter-meta";
import { RubyString } from "./runtime/string";

export interface INode {
    next_node: INode | null;
    get kind(): string;
}

export class InsnNode<T extends Instruction = Instruction> implements INode {
    public instruction: T;
    public next_node: INode | null;

    static KIND = "insn";

    constructor(instruction: T, next_node: INode | null = null) {
        this.instruction = instruction;
        this.next_node = next_node;
    }

    get kind(): string {
        return InsnNode.KIND;
    }
}

export class LabelNode implements INode {
    public label: Label;
    public next_node: INode | null;

    static KIND = "label";

    constructor(label: Label, next_node: INode | null = null) {
        this.label = label;
        this.next_node = next_node;
    }

    get kind(): string {
        return LabelNode.KIND;
    }
}

export class AnchorNode implements INode {
    public next_node: INode | null;

    static KIND = "anchor";

    constructor(next_node: INode | null = null) {
        this.next_node = next_node;
    }

    get kind(): string {
        return AnchorNode.KIND;
    }
}

export class LineNumberNode implements INode {
    public lineno: number;
    public next_node: INode | null;

    static KIND = "lineno";

    constructor(lineno: number, next_node: INode | null = null) {
        this.lineno = lineno;
        this.next_node = next_node;
    }

    get kind(): string {
        return LineNumberNode.KIND;
    }
}

// When the list of instructions is first being created, it's stored as a
// linked list. This is to make it easier to perform peephole optimizations
// and other transformations like instruction specialization.
export class InstructionList {
    public head_node: INode;
    public tail_node: INode;

    constructor() {
        this.head_node = new AnchorNode();
        this.tail_node = this.head_node;
    }

    is_empty() {
        return this.head_node === this.tail_node;
    }

    label(id?: string) {
        return new Label(id);
    }

    putnil() {
        this.push(new PutNil());
    }

    putstring(str: string, encoding?: RValue, frozen?: boolean, forcedBinary?: boolean) {
        this.push(new PutString(this.make_string(str, encoding, Boolean(frozen), Boolean(forcedBinary))));
    }

    // utility function
    make_string(str: string, encoding?: RValue, frozen?: boolean, forcedBinary?: boolean): RValue {
        // we have to look the constant up this way because the compiler does not
        // support async visitor methods
        const string_class = ObjectClass.get_data<Module>().constants["String"];
        const rval = new RValue(string_class, str);
        if (frozen) rval.freeze();
        if (forcedBinary) RubyString.get_context(rval).forcedBinary = true;
        if (encoding) RubyString.set_encoding(rval, encoding);
        return rval;
    }

    leave() {
        this.push(new Leave());
    }

    putself() {
        this.push(new PutSelf());
    }

    putobject(object: ValueType) {
        if (object.value === 0 && object.type === "Integer") {
            this.push(new PutObjectInt2Fix0());
        } else if (object.value === 1 && object.type === "Integer") {
            this.push(new PutObjectInt2Fix1());
        } else {
            this.push(new PutObject(object));
        }
    }

    getlocal(index: number, depth: number) {
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
    }

    setlocal(index: number, depth: number) {
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
    }

    setinstancevariable(name: string) {
        // @TODO figure out inline storage
        this.push(new SetInstanceVariable(name));
    }

    getinstancevariable(name: string) {
        // @TODO figure out inline storage
        this.push(new GetInstanceVariable(name))
    }

    setclassvariable(name: string) {
        this.push(new SetClassVariable(name));
    }

    getclassvariable(name: string) {
        this.push(new GetClassVariable(name));
    }

    getspecial(type: GetSpecialType, number: number) {
        this.push(new GetSpecial(type, number));
    }

    newarray(size: number) {
        this.push(new NewArray(size));
    }

    expandarray(size: number, flags: number) {
        this.push(new ExpandArray(size, flags));
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

    checkkeyword(keyword_bits_index: number, keyword_index: number) {
        this.push(new CheckKeyword(keyword_bits_index, keyword_index));
    }

    checkmatch(flag: number) {
        this.push(new CheckMatch(flag));
    }

    dup() {
        this.push(new Dup());
    }

    dupn(size: number) {
        this.push(new DupN(size));
    }

    adjuststack(size: number) {
        this.push(new AdjustStack(size));
    }

    pop() {
        this.push(new Pop());
    }

    jump(label: Label) {
        this.push(new Jump(label));
    }

    send(calldata: MethodCallData, block_iseq: InstructionSequence | null) {
        this.push(new Send(calldata, block_iseq));
    }

    send_without_block(calldata: MethodCallData) {
        this.push(new OptSendWithoutBlock(calldata));
    }

    opt_plus(calldata: MethodCallData) {
        this.push(new OptPlus(calldata));
    }

    opt_mult(calldata: MethodCallData) {
        this.push(new OptMult(calldata));
    }

    definemethod(name: string, method_iseq: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        this.push(new DefineMethod(name, method_iseq, parameters_meta, lexical_scope));
    }

    definesmethod(name: string, method_iseq: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        this.push(new DefineSMethod(name, method_iseq, parameters_meta, lexical_scope));
    }

    defineclass(name: string, iseq: InstructionSequence, flags: number) {
        this.push(new DefineClass(name, iseq, flags));
    }

    getconstant(name: string) {
        this.push(new GetConstant(name));
    }

    setconstant(name: string) {
        this.push(new SetConstant(name));
    }

    getglobal(name: string) {
        this.push(new GetGlobal(name));
    }

    setglobal(name: string) {
        this.push(new SetGlobal(name));
    }

    defined(type: DefinedType, name: string, message: RValue) {
        this.push(new Defined(type, name, message));
    }

    newhash(length: number) {
        this.push(new NewHash(length));
    }

    newrange(exclude_end: boolean) {
        this.push(new NewRange(exclude_end));
    }

    swap() {
        this.push(new Swap());
    }

    topn(count: number) {
        this.push(new TopN(count));
    }

    setn(count: number) {
        this.push(new SetN(count));
    }

    invokeblock(calldata: BlockCallData) {
        this.push(new InvokeBlock(calldata))
    }

    invokesuper(calldata: MethodCallData, block_iseq: InstructionSequence | null) {
        this.push(new InvokeSuper(calldata, block_iseq));
    }

    throw(type: ThrowType) {
        this.push(new Throw(type));
    }

    putspecialobject(type: SpecialObjectType) {
        this.push(new PutSpecialObject(type));
    }

    objtostring(calldata: MethodCallData) {
        this.push(new ObjToString(calldata));
    }

    anytostring() {
        this.push(new AnyToString());
    }

    toregexp(flags: number, size: number) {
        this.push(new ToRegexp(flags, size));
    }

    concatstrings(count: number) {
        this.push(new ConcatStrings(count));
    }

    intern() {
        this.push(new Intern());
    }

    splatarray(flag: boolean) {
        this.push(new SplatArray(flag));
    }

    concatarray() {
        this.push(new ConcatArray());
    }

    getblockparamproxy(index: number, depth: number) {
        this.push(new GetBlockParamProxy(index, depth));
    }

    each(cb: (node: INode) => void) {
        this.each_node((node: INode) => {
            cb(node);
        });
    }

    each_node(cb: (node: INode) => void) {
        let node: INode | null = this.head_node;

        while (node) {
            cb(node);
            node = node.next_node;
        }
    }

    push(label: Label): INode
    push(insn: Instruction): INode
    push(lineno: number): INode
    push(obj: Instruction | Label | number): INode {
        let node;

        if (obj instanceof Label) {
            node = new LabelNode(obj);
        } else if (obj instanceof Instruction) {
            node = new InsnNode(obj);
        } else {
            node = new LineNumberNode(obj);
        }

        this.push_node(node);
        return node;
    }

    push_node(node: INode | null): INode | null {
        if (!node) return node;

        if (this.head_node === null) {
            this.head_node = node;
            this.tail_node = node;
        } else {
            this.tail_node!.next_node = node
            this.tail_node = node
        }

        return node;
    }

    push_list(list2: InstructionList) {
        this.tail_node.next_node = list2.head_node;
        this.tail_node = list2.tail_node;
    }

    to_array(): Array<Instruction | Label | number> {
        const result: Array<Instruction | Label | number> = [];

        this.each(node => {
            switch (node.kind) {
                case "insn":
                    result.push((node as InsnNode).instruction);
                    break;
                case "label":
                    result.push((node as LabelNode).label);
                    break;
                case "lineno":
                    result.push((node as LineNumberNode).lineno);
                    break;
            }
        });

        return result;
    }

    capture(cb: () => void): InstructionList {
        const old_head = this.head_node;
        const old_tail = this.tail_node;

        this.head_node = new AnchorNode()
        this.tail_node = this.head_node;

        try {
            cb();

            const result = new InstructionList();

            result.head_node = this.head_node;
            result.tail_node = this.tail_node;

            return result;
        } finally {
            this.head_node = old_head;
            this.tail_node = old_tail;
        }
    }
}
