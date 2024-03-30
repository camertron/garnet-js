import { BlockCallData, MethodCallData } from "./call_data";
import { Frame } from "./frame";
import AdjustStack from "./insns/adjuststack";
import AnyToString from "./insns/any_to_string";
import BranchIf from "./insns/branchif";
import { BranchNil } from "./insns/branchnil";
import BranchUnless from "./insns/branchunless";
import ConcatStrings from "./insns/concat_strings";
import DefineClass from "./insns/defineclass";
import Defined, { DefinedType } from "./insns/defined";
import DefineMethod from "./insns/definemethod";
import DefineSMethod from "./insns/definesmethod";
import Dup from "./insns/dup";
import DupN from "./insns/dupn";
import ExpandArray from "./insns/expandarray";
import GetGlobal from "./insns/get_global";
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
import SetGlobal from "./insns/set_global";
import SetConstant from "./insns/setconstant";
import SetInstanceVariable from "./insns/setinstancevariable";
import SetLocal from "./insns/setlocal";
import SetLocalWC0 from "./insns/setlocal_wc_0";
import SetLocalWC1 from "./insns/setlocal_wc_1";
import SetN from "./insns/setn";
import Swap from "./insns/swap";
import Throw, { ThrowType } from "./insns/throw";
import TopN from "./insns/topn";
import ToRegexp from "./insns/toregexp";
import Instruction, { ValueType } from "./instruction";
import { LocalTable, Lookup } from "./local_table";
import { CompilerOptions } from "./compiler_options";
import { RValue } from "./runtime";
import { String as RubyString } from "./runtime/string";
import CheckKeyword from "./insns/checkkeyword";
import SetClassVariable from "./insns/setclassvariable";
import GetClassVariable from "./insns/getclassvariable";
import SplatArray from "./insns/splatarray";
import GetBlockParamProxy from "./insns/getblockparamproxy";
import ConcatArray from "./insns/concatarray";
import { ParameterMetadata } from "./runtime/parameter-meta";
import { LexicalScope } from "./compiler";

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

export class CatchTable {
    public entries: CatchEntry[];

    constructor() {
        this.entries = [];
    }

    find_catch_entry<T extends CatchEntry>(type: new (...args: any[]) => T): T | null {
        for (const catch_entry of this.entries) {
            if (catch_entry instanceof type) {
                return catch_entry;
            }
        }

        return null;
    }

    catch_break(iseq: InstructionSequence | null, begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchBreak(
                iseq,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }

    catch_ensure(iseq: InstructionSequence, begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchEnsure(
                iseq,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }

    catch_next(begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchNext(
                null,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }

    catch_redo(begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchRedo(
                null,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }

    catch_rescue(iseq: InstructionSequence, begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchRescue(
                iseq,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }

    catch_retry(begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.entries.push(
            new CatchRetry(
                null,
                begin_label,
                end_label,
                cont_label,
                restore_sp
            )
        );
    }
}

export class CatchTableStack {
    private elements: CatchTable[];

    constructor() {
        this.elements = [];
    }

    with_catch_table(callback: () => void) {
        this.elements.push(new CatchTable());
        callback();
        this.elements.pop();
    }

    find_catch_entry<T extends CatchEntry>(...args: Parameters<typeof CatchTable.prototype.find_catch_entry<T>>): ReturnType<typeof CatchTable.prototype.find_catch_entry<T>> {
        if (this.current) {
            return this.current.find_catch_entry(...args);
        } else {
            return null;
        }
    }

    catch_break(...args: Parameters<typeof CatchTable.prototype.catch_break>) {
        this.current.catch_break(...args);
    }

    catch_ensure(...args: Parameters<typeof CatchTable.prototype.catch_ensure>) {
        this.current.catch_ensure(...args);
    }

    catch_next(...args: Parameters<typeof CatchTable.prototype.catch_next>) {
        this.current.catch_next(...args);
    }

    catch_redo(...args: Parameters<typeof CatchTable.prototype.catch_redo>) {
        this.current.catch_redo(...args);
    }

    catch_rescue(...args: Parameters<typeof CatchTable.prototype.catch_rescue>) {
        this.current.catch_rescue(...args);
    }

    catch_retry(...args: Parameters<typeof CatchTable.prototype.catch_retry>) {
        this.current.catch_retry(...args);
    }

    private get current(): CatchTable {
        return this.elements[this.elements.length - 1];
    }
}

export class CatchEntry {
    public iseq: InstructionSequence | null;
    public begin_label: Label;
    public end_label: Label;
    public cont_label: Label;
    public restore_sp: number;

    constructor(iseq: InstructionSequence | null, begin_label: Label, end_label: Label, cont_label: Label, restore_sp: number) {
        this.iseq = iseq;
        this.begin_label = begin_label;
        this.end_label = end_label;
        this.cont_label = cont_label;
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
    lead_num: number | null,
    opt: Label[],
    rest_start: number | null,
    post_start: number | null,
    post_num: number | null,
    block_start: number | null;
    keyword: [string, RValue | null][] | null;
    keyword_bits_index: number | null;
    keyword_rest_start: number | null;
}

export class InstructionSequence {
    public name: string;
    public file: string;
    public absolute_path: string;
    public line: number;
    public type: string;
    public lexical_scope: LexicalScope;
    public parent_iseq: InstructionSequence | null;
    public options: CompilerOptions

    public argument_size: number;
    public argument_options: ArgumentOptions;
    public catch_table: CatchTable;
    public local_table: LocalTable;
    public inline_storages: any;
    public insns: InstructionList;
    public compiled_insns: (Instruction | number | string | Label)[];
    public storage_index: number;
    public stack: Stack;

    constructor(name: string, file: string, absolute_path: string, line: number, type: string, lexical_scope: LexicalScope, parent_iseq: InstructionSequence | null = null, options: CompilerOptions) {
        this.name = name;
        this.file = file;
        this.absolute_path = absolute_path;
        this.line = line;
        this.type = type;
        this.lexical_scope = lexical_scope;
        this.parent_iseq = parent_iseq;

        this.argument_size = 0;
        this.catch_table = new CatchTable();

        this.argument_options = {
            lead_num: null,
            opt: [],
            rest_start: null,
            post_start: null,
            post_num: null,
            block_start: null,
            keyword: null,
            keyword_bits_index: null,
            keyword_rest_start: null
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

    objtostring(calldata: MethodCallData) {
        this.push(new ObjToString(calldata));
    }

    anytostring() {
        this.push(new AnyToString());
    }

    toregexp(options: string, size: number) {
        this.push(new ToRegexp(options, size));
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

    private child_iseq(name: string, line: number, type: string, lexical_scope: LexicalScope): InstructionSequence {
        return new InstructionSequence(name, this.file, this.absolute_path, line, type, lexical_scope, this, this.options);
    }

    method_child_iseq(name: string, line: number, lexical_scope: LexicalScope) {
        return this.child_iseq(name, line, "method", lexical_scope);
    }

    block_child_iseq(line: number, lexical_scope: LexicalScope): InstructionSequence {
        let current: InstructionSequence = this;

        while (current.type == "block") {
            // @ts-ignore
            current = current.parent_iseq;
        }

        return this.child_iseq(`block in ${current.name}`, line, "block", lexical_scope);
    }

    class_child_iseq(name: string, line: number, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`<class:${name}>`, line, "class", lexical_scope);
    }

    module_child_iseq(name: string, line: number, lexical_scope: LexicalScope) {
        return this.child_iseq(`<module:${name}>`, line, "class", lexical_scope);
    }

    singleton_class_child_iseq(line: number, lexical_scope: LexicalScope) {
        return this.child_iseq("singleton class", line, "class", lexical_scope);
    }

    rescue_child_iseq(line: number, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`rescue in ${this.name}`, line, "rescue", lexical_scope);
    }

    ensure_child_iseq(line: number, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`ensure in ${this.name}`, line, "ensure", lexical_scope);
    }

    compile() {
        // @TODO: optimizations and specializations

        this.catch_table.entries.forEach((catch_entry) => {
            if (!(catch_entry instanceof CatchBreak) && catch_entry.iseq) {
                catch_entry.iseq.compile();
            }
        });

        let length = 0;

        this.insns.each((insn) => {
            if (insn instanceof Label) {
                insn.patch(`label_${length}`);
            } else if (typeof insn === 'number') {
                // skip
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
}
