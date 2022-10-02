import CallData from "./call_data";
import { NotImplementedError } from "./errors";
import { ExecutionContext } from "./execution_context";
import DefineClass from "./insns/defineclass";
import DefineMethod from "./insns/definemethod";
import DupArray from "./insns/duparray";
import GetConstant from "./insns/getconstant";
import GetLocalWC0 from "./insns/getlocal_wc_0";
import Leave from "./insns/leave";
import NewHash from "./insns/newhash";
import NewArray from "./insns/new_array";
import OptGetInlineCache from "./insns/opt_getinlinecache";
import OptMult from "./insns/opt_mult";
import OptSendWithoutBlock from "./insns/opt_send_without_block";
import OptSetInlineCache from "./insns/opt_setinlinecache";
import Pop from "./insns/pop";
import PutNil from "./insns/putnil";
import PutObject from "./insns/putobject";
import PutObjectInt2Fix0 from "./insns/putobject_int2fix_0";
import PutObjectInt2Fix1 from "./insns/putobject_int2fix_1";
import PutSelf from "./insns/putself";
import PutSpecialObject from "./insns/putspecialobject";
import PutString from "./insns/putstring";
import Send from "./insns/send";
import SetLocalWC0 from "./insns/setlocal_wc_0";
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

type ArgDataSig = {
    lead_num?: number;
}

type CallDataSig = {
    mid: string,
    orig_argc: number,
    flag: number
}

// This object represents a set of instructions that will be executed.
export class InstructionSequence {
    public iseq: YarvJson;
    public parent?: InstructionSequence;
    public insns: Instruction[];
    public labels: Map<Instruction, number>;

    // # These handlers handle thrown exceptions.
    // ThrowHandler =
    //   Struct.new(:type, :iseq, :begin_label, :end_label, :exit_label)

    // attr_reader :throw_handlers

    constructor(iseq: YarvJson, parent?: InstructionSequence) {
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

    static compile(iseq: YarvJson, parent?: InstructionSequence): InstructionSequence {
        let compiled = new InstructionSequence(iseq, parent);
        let insns = iseq[iseq.length - 1];

        insns.forEach( (insn: any) => {
            switch(insn[0]) {
                case "putobject": {
                    const [, object] = insn;
                    compiled.push(new PutObject(object));
                    break;
                }
                case "putself": {
                    compiled.push(new PutSelf());
                    break;
                }
                case "putstring": {
                    const [, str] = insn;
                    compiled.push(new PutString(String.new(str)));
                    break;
                }
                case "putnil": {
                    compiled.push(new PutNil());
                    break;
                }
                case "putspecialobject": {
                    const [, val] = insn;
                    compiled.push(new PutSpecialObject(val));
                    break;
                }
                case "putobject_INT2FIX_0_": {
                    compiled.push(new PutObjectInt2Fix0());
                    break;
                }
                case "putobject_INT2FIX_1_": {
                    compiled.push(new PutObjectInt2Fix1());
                    break;
                }
                case "newarray": {
                    const [, size] = insn;
                    compiled.push(new NewArray(size));
                    break;
                }
                case "newhash": {
                    const [, size] = insn;
                    compiled.push(new NewHash(size));
                    break;
                }
                case "duparray": {
                    const [, values] = insn;
                    compiled.push(new DupArray(values));
                    break;
                }
                case "pop": {
                    compiled.push(new Pop());
                    break;
                }
                case "setlocal_WC_0": {
                    const [, offset] = insn;
                    const index = compiled.local_index(offset);
                    compiled.push(new SetLocalWC0(compiled.locals()[index], index));
                    break;
                }
                case "getconstant": {
                    const [, name] = insn;
                    compiled.push(new GetConstant(name));
                    break;
                }
                case "getlocal_WC_0": {
                    const [, offset] = insn;
                    const index = compiled.local_index(offset);
                    compiled.push(new GetLocalWC0(compiled.locals()[index], index));
                    break;
                }
                case "opt_setinlinecache": {
                    const [, cache] = insn;
                    compiled.push(new OptSetInlineCache(cache));
                    break;
                }
                case "opt_getinlinecache": {
                    const [, label, cache] = insn;
                    compiled.push(new OptGetInlineCache(label, cache));
                    break;
                }
                case "definemethod": {
                    const [, name, iseq] = insn;
                    compiled.push(new DefineMethod(name, this.compile(iseq, compiled)));
                    break;
                }
                case "defineclass": {
                    const [, name, iseq, flags] = insn;
                    compiled.push(new DefineClass(name, this.compile(iseq, compiled), flags));
                    break;
                }
                case "send": {
                    const [, call_data, block_iseq] = insn;
                    const { mid, orig_argc, flag }: CallDataSig = call_data;
                    const compiled_block_iseq = ( () => {
                        if (block_iseq) {
                            return this.compile(block_iseq, compiled);
                        } else {
                            return undefined;
                        }
                    })();

                    compiled.push(new Send(new CallData(mid, orig_argc, flag), compiled_block_iseq));

                    break;
                }
                case "opt_send_without_block": {
                    const { mid, orig_argc, flag }: CallDataSig = insn[1];
                    compiled.push(
                        new OptSendWithoutBlock(
                            new CallData(mid, orig_argc, flag)
                        )
                    );

                    break;
                }
                case "opt_mult": {
                    const { mid, orig_argc, flag }: CallDataSig = insn[1];
                    compiled.push(new OptMult(new CallData("*", 1, flag)));
                    break;
                }
                case "leave": {
                    compiled.push(new Leave());
                    break;
                }
                default: {
                    if (insn instanceof Array) {
                        console.log(`Encountered unhandled instruction '${insn[0]}'`);
                    }
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

    // Indices that are given for getlocal and setlocal instructions are actually
    // how far back they are from the top of the stack. So here we do a little
    // math to make them a little easier to work with.
    local_index(offset: number): number {
        return (this.locals().length - (offset - 3)) - 1;
    }

    // This is the information about the arguments that should be passed into
    // this instruction sequence.
    args(): ArgDataSig {
        return this.iseq[11];
    }

//     # These are the various ways the instruction sequence handles raised
//     # exceptions.
//     def catch_table
//       iseq[12]
//     end

    evaluate(selfo: RValue, context?: ExecutionContext) {
        if (!context) {
            context = new ExecutionContext();
        }

        context.evaluate(selfo, this);
    }
//   end
}
