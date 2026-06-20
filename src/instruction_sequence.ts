import DefineClass from "./insns/defineclass";
import DefineMethod from "./insns/definemethod";
import DefineSMethod from "./insns/definesmethod";
import InvokeSuper from "./insns/invokesuper";
import Once from "./insns/once";
import Send from "./insns/send";
import Instruction from "./instruction";
import { LocalTable, Lookup } from "./local_table";
import { CompilerOptions } from "./compiler_options";
import { RValue } from "./runtime";
import { SourceLocation, LexicalScope } from "./compiler";
import { Disassembler } from "./disassembler";
import { InsnNode, InstructionList, LabelNode } from "./instruction_list";

// This represents the destination of instructions that jump. Initially it
// does not track its position so that when we perform optimizations the
// indices don't get messed up.
export class Label {
    public name: string | null;

    // The slot position of this label in the containing sequence.
    // Only used in disasm output.
    public pos: number = -1;

    constructor(name: string | null = null) {
        this.name = name;
    }

    patch(name: string, pos: number) {
        this.name = name;
        this.pos = pos;
    }

    equals(other: Label) {
        return other instanceof Label && this.name == other.name;
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
    repeated_params: number[] | null; // indices of repeated parameters (e.g., duplicate _ params)
}

export class InstructionSequence extends InstructionList {
    public name: string;
    public file: string;
    public absolute_path: string;
    public location: SourceLocation | null;
    public type: string;
    public lexical_scope: LexicalScope;
    public parent_iseq: InstructionSequence | null;
    public options: CompilerOptions

    public argument_size: number;
    public argument_options: ArgumentOptions;
    public catch_table: CatchTable;
    public local_table: LocalTable;
    public inline_storages: any;
    public compiled_insns: (Instruction | number | string | Label)[];
    public storage_index: number;

    constructor(name: string, file: string, absolute_path: string, location: SourceLocation | null, type: string, lexical_scope: LexicalScope, parent_iseq: InstructionSequence | null = null, options: CompilerOptions) {
        super();

        this.name = name;
        this.file = file;
        this.absolute_path = absolute_path;
        this.location = location;
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
            keyword_rest_start: null,
            repeated_params: null
        };

        this.local_table = new LocalTable();
        this.inline_storages = {};
        this.storage_index = 0;

        this.options = options;
    }

    label(id?: string) {
        return new Label(id);
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

    private child_iseq(name: string, coords: SourceLocation, type: string, lexical_scope: LexicalScope): InstructionSequence {
        return new InstructionSequence(name, this.file, this.absolute_path, coords, type, lexical_scope, this, this.options);
    }

    method_child_iseq(name: string, coords: SourceLocation, lexical_scope: LexicalScope) {
        return this.child_iseq(name, coords, "method", lexical_scope);
    }

    block_child_iseq(coords: SourceLocation, lexical_scope: LexicalScope): InstructionSequence {
        let current: InstructionSequence = this;

        while (current.type == "block") {
            // @ts-ignore
            current = current.parent_iseq;
        }

        return this.child_iseq(`block in ${current.name}`, coords, "block", lexical_scope);
    }

    class_child_iseq(name: string, coords: SourceLocation, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`<class:${name}>`, coords, "class", lexical_scope);
    }

    module_child_iseq(name: string, coords: SourceLocation, lexical_scope: LexicalScope) {
        return this.child_iseq(`<module:${name}>`, coords, "class", lexical_scope);
    }

    singleton_class_child_iseq(coords: SourceLocation, lexical_scope: LexicalScope) {
        return this.child_iseq("singleton class", coords, "class", lexical_scope);
    }

    rescue_child_iseq(coords: SourceLocation, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`rescue in ${this.name}`, coords, "rescue", lexical_scope);
    }

    ensure_child_iseq(coords: SourceLocation, lexical_scope: LexicalScope): InstructionSequence {
        return this.child_iseq(`ensure in ${this.name}`, coords, "ensure", lexical_scope);
    }

    compile() {
        // @TODO: optimizations and specializations

        this.catch_table.entries.forEach((catch_entry) => {
            if (!(catch_entry instanceof CatchBreak) && catch_entry.iseq) {
                catch_entry.iseq.compile();
            }
        });

        let length = 0;
        let label_counter = 0;

        this.each((inode) => {
            switch (inode.kind) {
                case "label":
                    const label = (inode as LabelNode).label;
                    label.patch(`label_${label_counter++}`, length);
                    break;

                case "insn":
                    const insn: Instruction = (inode as InsnNode).instruction;

                    if (insn instanceof DefineClass) {
                        insn.iseq.compile();
                        insn.patch(length);
                        length += insn.length();
                    } else if (insn instanceof DefineMethod || insn instanceof DefineSMethod) {
                        insn.iseq.compile!();
                        insn.patch(length);
                        length += insn.length();
                    } else if (insn instanceof InvokeSuper || insn instanceof Send) {
                        if (insn.block_iseq) {
                            insn.block_iseq.compile();
                        }

                        insn.patch(length);
                        length += insn.length();
                    } else if (insn instanceof Once) {
                        insn.iseq.compile();
                        insn.patch(length);
                        length += insn.length();
                    } else {
                        insn.patch(length);
                        length += insn.length();
                    }

                    break;
            }
        });

        this.compiled_insns = this.to_array();
    }

    disasm(): string {
        const fmt = new Disassembler();
        fmt.enqueue(this);
        fmt.format_bang();
        return fmt.output;
    }

    inspect(): string {
        const start_line = this.location?.start_line ?? 1;
        const start_column = this.location?.start_column ?? 0;
        const end_line = this.location?.end_line ?? 1;
        const end_column = this.location?.end_column ?? 0;

        return `#<ISeq:${this.name}@${this.file}:1 (${start_line},${start_column})-(${end_line},${end_column})>`;
    }
}
