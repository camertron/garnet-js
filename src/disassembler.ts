import { CallData } from "./call_data";
import Instruction, { ValueType } from "./instruction";
import { CatchBreak, CatchNext, CatchRedo, CatchRescue, InstructionList, InstructionSequence, Label, StackPosition } from "./instruction_sequence";

// This class is another object that handles disassembling a YARV
// instruction sequence but it renders it without any of the extra spacing
// or alignment.
export class Squished {
    calldata(call_data: CallData) {
        return call_data.to_s();
    }

    enqueue(_iseq: InstructionSequence) {
    }

    event(_name: string) {
    }

    instruction(name: string, operands: string[] = []): string {
        return operands.length === 0 ? name : `${name} ${operands.join(", ")}`;
    }

    label(label: Label): string {
        const name = label.name;
        return name ? name.slice("label_".length).padStart(4, "0") : "?";
    }

    local(index: number) {
        return index.toString();
    }

    object(value: any): string {
        return value.toString();
    }
}

export class Disassembler {
    public output: string;
    private queue: InstructionSequence[];

    private current_prefix: string;
    private current_iseq: InstructionSequence | null;

    constructor(current_iseq: InstructionSequence | null = null) {
        this.output = "";
        this.queue = [];
        this.current_prefix = "";
        this.current_iseq = current_iseq;
    }

    // #######################################################################
    // Helpers for various instructions
    // #######################################################################

    calldata(call_data: CallData) {
        return call_data.to_s();
    }

    enqueue(iseq: InstructionSequence) {
        this.queue.push(iseq);
    }

    event(name: string): string {
        switch(name) {
            case "RUBY_EVENT_B_CALL":
                return "Bc";
            case "RUBY_EVENT_B_RETURN":
                return "Br";
            case "RUBY_EVENT_CALL":
                return "Ca";
            case "RUBY_EVENT_CLASS":
                return "Cl";
            case "RUBY_EVENT_END":
                return "En";
            case "RUBY_EVENT_LINE":
                return "Li";
            case "RUBY_EVENT_RETURN":
                return "Re";
            default:
                throw new Error(`Unknown event: ${name}`)
        }
    }

    instruction(name: string, operands: string[] = []): string {
        if (operands.length === 0) {
            return name;
        } else {
            return `${name.padEnd(38, " ")} ${operands.join(", ")}`;
        }
    }

    label(label: Label): string {
        const name = label.name;
        return name ? name.slice("label_".length) : "?"
    }

    local(index: number, explicit: number | null = null, implicit: number | null = null): string {
        let current = this.current_iseq;

        for (let i = 0; i < (explicit || implicit || 0); i ++) {
            current = current!.parent_iseq;
        }

        let value = `${current!.local_table.name_at(index)}@${index}`
        if (explicit) value = `${value}, ${explicit}`;

        return value;
    }

    object(object: any) {
        if (object.type) {
            return (object as ValueType).value.toString();
        } else {
            return object.toString();
        }
    }

    // #######################################################################
    // Entrypoints
    // #######################################################################

    format_bang() {
        let current_iseq;

        while (current_iseq = this.queue.shift()) {
            if (this.output.length > 0) this.output = `${this.output}\n`;
            this.format_iseq(current_iseq);
        }
    }

    format_insns_bang(insns: InstructionList, length: number = 0, cb?: (insn: Instruction, length: number) => void) {
        const events: string[] = [];
        const lines: number[] = [];

        insns.each((insn) => {
            if (insn instanceof Label) {
                // skip
            } else if (typeof insn === 'number') {
                lines.push(insn);
            } else if (insn instanceof StackPosition) {
                // what do we do here?
            } else {
                this.output += `${this.current_prefix}${length.toString().padStart(4, "0")} `;

                const disasm = insn.disasm(this);
                this.output += disasm;

                if (lines.length > 0) {
                    if (disasm.length < 65) {
                        this.output += " ".repeat(65 - disasm.length);
                    }
                } else if (events.length > 0) {
                    if (disasm.length < 39) {
                        this.output += " ".repeat(39 - disasm.length);
                    }
                }

                if (lines.length > 0) {
                    this.output += `(${lines[lines.length - 1].toString().padStart(4, " ")})`;
                    lines.splice(0, -1);
                }

                if (events.length > 0) {
                    this.output += `[${events.join("")}]`;
                    events.splice(0, -1);
                }

                // A hook here to allow for custom formatting of instructions after
                // the main body has been processed.
                if (cb) {
                    cb(insn, length);
                }

                this.output += "\n";
                length += insn.length();
            }
        });
    }

    print(str: string) {
        this.output += str;
    }

    puts(str: string) {
        this.output += `${str}\n`;
    }

    to_s(): string {
        return this.output;
    }

    with_prefix(value: string, cb: (str: string) => void) {
        const previous = this.current_prefix;

        try {
            this.current_prefix = value;
            cb(value);
        } finally {
            this.current_prefix = previous;
        }
    }

    private format_iseq(iseq: InstructionSequence) {
        this.output += `${this.current_prefix}== disasm: ${iseq.inspect()} `

        if (iseq.catch_table.entries.length > 0) {
            this.output += "(catch: TRUE)\n";
            this.output += `${this.current_prefix}== catch table\n`;

            this.with_prefix(`${this.current_prefix}| `, () => {
                for (const entry of iseq.catch_table.entries) {
                    if (entry instanceof CatchBreak) {
                        this.output += `${this.current_prefix}catch type: break\n`;
                        this.format_iseq(entry.iseq!);
                    } else if (entry instanceof CatchNext) {
                        this.output += `${this.current_prefix}catch type: next\n`;
                    } else if (entry instanceof CatchRedo) {
                        this.output += `${this.current_prefix}catch type: redo\n`;
                    } else if (entry instanceof CatchRescue) {
                        this.output += `${this.current_prefix}catch type: rescue\n`
                        this.format_iseq(entry.iseq!);
                    }
                }
            });

            this.output += `${this.current_prefix}|${"-".repeat(72)}\n`;
        } else {
            this.output += "(catch: FALSE)\n";
        }

        if (!iseq.local_table.is_empty()) {
            this.output += `${this.current_prefix}local table (size: ${iseq.local_table.locals.length})\n`;

            const locals = iseq.local_table.locals.map((local, index) => {
                const offset = iseq.local_table.offset(index).toString().padStart(2, "0");
                return `[${offset}] ${local.name}@${index}`;
            });

            this.output += `${this.current_prefix}${locals.join("    ")}\n`;
        }

        this.format_insns_bang(iseq.insns);
    }
}
