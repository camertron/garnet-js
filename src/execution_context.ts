import CallData from "./call_data";
import Frame from "./frame";
import Leave from "./insns/leave";
import { InstructionSequence } from "./instruction_sequence";
import { Array } from "./runtime";
import { Class, ClassClass, Object, RValue, String } from "./runtime";

// This is the object that gets passed around all of the instructions as they
// are being executed.
export class ExecutionContext {
    static current: ExecutionContext;

    // The system stack that tracks values through the execution of the program.
    public stack: RValue[];

    // The global variables accessible to the program. These mirror the runtime
    // global variables if they have not been overridden.
    public globals: {[key: string]: RValue};

    // This is a stack of frames as they are being executed.
    public frames: Frame[];

    // The program counter used to determine which instruction to execute next.
    // This is public because it can be modified by instructions being executed.
    private program_counter: number;

    constructor() {
        this.stack = [];
        this.frames = [];
        this.program_counter = 0;

        // the way we're creating arrays here will need to change
        this.globals = {
            '$:': Array.new(),
            '$"': Array.new()
        };

        ExecutionContext.current = this;
    }

    call_method(call_data: CallData, receiver: RValue, args: RValue[], block?: RValue): RValue {
        return Object.send(receiver, call_data.mid, ...args);
    }

    // This returns the current execution frame.
    current_frame(): Frame {
        return this.frames[this.frames.length - 1];
    }

    // This returns the instruction sequence object that is currently being
    // executed. In other words, the instruction sequence that is at the top of
    // the frame stack.
    current_iseq(): InstructionSequence {
        return this.current_frame().iseq;
    }

    define_method(object: RValue, name: string, iseq: InstructionSequence) {
        if (object.klass === ClassClass) {
            object.get_data<Class>().define_method(name, iseq);
        } else {
            object.klass.get_data<Class>().define_method(name, iseq);
        }
    }

    // This executes the given instruction sequence within a new execution frame.
    with_frame(selfo: RValue, iseq: InstructionSequence, cb: (iseq: InstructionSequence) => void) {
        const current_program_counter = this.program_counter;
        const current_stack_length = this.stack.length;

        this.frames.push(new Frame(selfo, iseq));
        this.program_counter = 0;

        try {
            cb(iseq);
        } finally {
            this.frames.pop();
            this.program_counter = current_program_counter;
            this.stack = this.stack.slice(0, current_stack_length + 1);
        }
    }

    // Pushes a new frame onto the stack, executes the instructions contained
    // within this instruction sequence, then pops the frame off the stack.
    evaluate(selfo: RValue, iseq: InstructionSequence, cb?: () => void) {
        this.with_frame(selfo, iseq, () => {
            if (cb) {
                cb();
            }

            while(true) {
                const insn = iseq.insns[this.program_counter];
                this.program_counter ++;
                insn.call(this);

                if (insn instanceof Leave) {
                    break;
                }
            }
        });
    }
}
