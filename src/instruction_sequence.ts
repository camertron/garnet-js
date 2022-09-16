import CallData from "./call_data";
import { NotImplementedError } from "./errors";
import ExecutionContext from "./execution_context";
import DefineClass from "./insns/defineclass";
import DefineMethod from "./insns/definemethod";
import Leave from "./insns/leave";
import OptSendWithoutBlock from "./insns/opt_send_without_block";
import PutObject from "./insns/putobject";
import PutSelf from "./insns/putself";
import PutString from "./insns/putstring";
import Instruction from "./instruction";
import { RValue, String } from "./runtime";

class UnimplementedInstruction {
    public name: string;
    public args: any[];

    constructor(name: string, ...args: any) {
        this.name = name;
        this.args = args;
    }

    call(context: ExecutionContext) {
        throw new NotImplementedError(`Unimplemented instruction: ${this.name}`);
    }

    deconstruct_keys(keys: string[]): {name: string, args: any[]} {
        return { name: this.name, args: this.args };
    }

    to_s(): string {
        return this.name;
    }
}

export type YarvJson = any;

type ArgData = {
    lead_num?: number;
}

// This object represents a set of instructions that will be executed.
export class InstructionSequence {
    public selfo: RValue;
    public iseq: YarvJson;
    public parent?: InstructionSequence;
    public insns: Instruction[];
    public labels: Map<Instruction, number>;

    // # These handlers handle thrown exceptions.
    // ThrowHandler =
    //   Struct.new(:type, :iseq, :begin_label, :end_label, :exit_label)

    // attr_reader :throw_handlers

    constructor(selfo: RValue, iseq: YarvJson, parent?: InstructionSequence) {
      this.selfo = selfo;
      this.iseq = iseq;
      this.parent = parent;

      this.insns = [];
      this.labels = new Map();

    //   @throw_handlers =
    //     (catch_table || []).map do |handler|
    //       type, child_iseq, begin_label, end_label, exit_label, = handler
    //       throw_iseq =
    //         InstructionSequence.compile(selfo, child_iseq, self) if child_iseq

    //       ThrowHandler.new(type, throw_iseq, begin_label, end_label, exit_label)
    //     end
    }

    static compile(selfo: RValue, iseq: YarvJson, parent?: InstructionSequence): InstructionSequence {
        let compiled = new InstructionSequence(selfo, iseq, parent);
        let insns = iseq[iseq.length - 1];

        insns.forEach( (insn: any) => {
            switch(insn[0]) {
                case "putobject": {
                    const [, object] = insn;
                    compiled.push(new PutObject(object));
                    break;
                }
                case "putself": {
                    compiled.push(new PutSelf(selfo));
                    break;
                }
                case "putstring": {
                    const [, str] = insn;
                    compiled.push(new PutString(String.new(str)));
                    break;
                }
                case "definemethod": {
                    const [, name, iseq] = insn;
                    compiled.push(new DefineMethod(name, this.compile(selfo, iseq, compiled)));
                    break;
                }
                case "defineclass": {
                    const [, name, iseq, flags] = insn;
                    compiled.push(new DefineClass(name, this.compile(selfo, iseq, compiled), flags));
                    break;
                }
                case "opt_send_without_block": {
                    const { mid, orig_argc, flag }: { mid: string, orig_argc: number, flag: number } = insn[1];
                    compiled.push(
                        new OptSendWithoutBlock(
                            new CallData(mid, orig_argc, flag)
                        )
                    );

                    break;
                }
                case "leave": {
                    compiled.push(new Leave());
                    break;
                }
            }
        });

        return compiled;
    }

    push(insn: Instruction) {
        this.insns.push(insn);
    }

//     def ==(other)
//       other in InstructionSequence[insns: ^(insns), labels: ^(labels.values)]
//     end

//     def deconstruct_keys(keys)
//       { insns:, labels: labels.values }
//     end

//     def child_iseqs
//       child_iseqs = []
//       insns.each do |insn|
//         case insn
//         when DefineMethod
//           child_iseqs << insn.iseq
//         when Send
//           child_iseqs << insn.block_iseq if insn.block_iseq
//         end
//       end
//       child_iseqs
//     end

//     def all_iseqs
//       [self] + child_iseqs.flat_map(&:all_iseqs)
//     end

//     # Print out this instruction sequence to the given output stream.
//     def disasm(output = StringIO.new, prefix = "")
//       output.print("#{prefix}#{disasm_header("disasm")} ")
//       handled = []

//       if throw_handlers.any?
//         output.puts("(catch: TRUE)")
//         output.puts("#{prefix}== catch table")

//         throw_handlers.each do |handler|
//           output.puts("#{prefix}| catch type: #{handler.type}")

//           if handler.iseq
//             handler.iseq.disasm(output, "#{prefix}| ")
//             handled << handler.iseq
//           end
//         end

//         output.puts("#{prefix}|#{"-" * 72}")
//       else
//         output.puts("(catch: FALSE)")
//       end

//       insns.each_with_index do |insn, insn_pc|
//         output.puts(prefix + disasm_insn(insn, insn_pc))
//       end

//       child_iseqs.each do |child_iseq|
//         output.puts
//         child_iseq.disasm(output, prefix)
//       end

//       output.string
//     end

//     def disasm_header(tag)
//       "== #{tag} #<ISeq:#{name}>"
//     end

//     def disasm_insn(insn, insn_pc)
//       "#{InstructionSequence.disasm_pc(insn_pc)} #{insn.disasm(self)}"
//     end

//     def self.disasm_pc(pc)
//       pc.to_s.rjust(4, "0")
//     end

//     # This is the name assigned to this instruction sequence.
//     def name
//       iseq[5]
//     end

    // These are the names of the locals in the instruction sequence.
    locals(): string[] {
        return this.iseq[10];
    }

//     # Indices that are given for getlocal and setlocal instructions are actually
//     # how far back they are from the top of the stack. So here we do a little
//     # math to make them a little easier to work with.
//     def local_index(offset)
//       (locals.length - (offset - 3)) - 1
//     end

    // This is the information about the arguments that should be passed into
    // this instruction sequence.
    args(): ArgData {
        return this.iseq[11];
    }

//     # These are the various ways the instruction sequence handles raised
//     # exceptions.
//     def catch_table
//       iseq[12]
//     end

    evaluate(context?: ExecutionContext) {
        if (!context) {
            context = new ExecutionContext();
        }

        context.evaluate(this);
    }
//   end
}
