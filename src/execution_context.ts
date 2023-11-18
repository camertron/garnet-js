import CallData from "./call_data";
import { BlockFrame, ClassFrame, Frame, MethodFrame, RescueFrame, TopFrame } from "./frame";
import Instruction from "./instruction";
import { CatchBreak, CatchEntry, CatchNext, CatchRescue, InstructionSequence, Label } from "./instruction_sequence";
import { Array as RubyArray, ModuleClass, Class, ClassClass, Object, RValue, String } from "./runtime";

export type ExecutionResult = JumpResult | LeaveResult | null;

export class JumpResult {
    public label: Label;

    constructor(label: Label) {
        this.label = label;
    }
}

export class LeaveResult {
    public value: RValue;

    constructor(value: RValue) {
        this.value = value;
    }
}

class ThrownError extends Error {
    public value: RValue;
    public backtrace: string[];

    constructor(value: RValue, backtrace: string[]) {
        super("This error was thrown by the Ruby VM.");
        this.value = value;
        this.backtrace = backtrace;
    }
}

class ReturnError extends ThrownError {
}

class BreakError extends ThrownError {
}

class NextError extends ThrownError {
}

// This is the object that gets passed around all of the instructions as they
// are being executed.
export class ExecutionContext {
    static current: ExecutionContext;

    // The system stack that tracks values through the execution of the program.
    public stack: RValue[];

    // The global variables accessible to the program. These mirror the runtime
    // global variables if they have not been overridden.
    public globals: {[key: string]: RValue};

    // The current frame.
    public frame: Frame | null;

    constructor() {
        this.stack = [];

        this.globals = {
            '$:': RubyArray.new(),
            '$"': RubyArray.new()
        };
    }

    push_onto_load_path(path: string) {
        this.globals["$:"].get_data<RubyArray>().elements.push(String.new(path));
    }

    call_method(call_data: CallData, receiver: RValue, args: RValue[], block?: RValue): RValue {
        return Object.send(receiver, call_data.mid, args, block);
    }

    // This returns the instruction sequence object that is currently being
    // executed. In other words, the instruction sequence that is at the top of
    // the frame stack.
    current_iseq(): InstructionSequence {
        return this.frame!.iseq;
    }

    define_method(object: RValue, name: string, iseq: InstructionSequence) {
        if (object.klass === ClassClass || object.klass == ModuleClass) {
            object.get_data<Class>().define_method(name, iseq);
        } else {
            object.klass.get_data<Class>().define_method(name, iseq);
        }
    }

    run_frame(frame: Frame, cb?: () => Label | null): RValue {
        // First, set the current frame to the given value.
        let previous = this.frame;
        this.frame = frame;

        // Next, set up the local table for the frame. This is actually incorrect
        // as it could use the values already on the stack, but for now we're
        // just doing this for simplicity.
        this.stack.push(...Array(frame.iseq.local_table.size()).fill(null));

        // Yield so that some frame-specific setup can be done.
        const start_label = cb ? cb() : null;

        if (start_label) {
            frame.pc = frame.iseq.compiled_insns.indexOf(start_label);
        }

        // Finally we can execute the instructions one at a time. If they return
        // jumps or leaves we will handle those appropriately.
        while (true) {
            const insn = frame.iseq.compiled_insns[frame.pc];

            switch (insn.constructor) {
                case Number:
                    this.frame.line = insn as number;
                    frame.pc += 1;
                    break;

                case String:
                    frame.pc += 1;
                    break;

                case Label:
                    // skip labels
                    frame.pc += 1;
                    break;

                default: {
                    let result: ExecutionResult | RValue = null;

                    try {
                        result = (insn as Instruction).call(this);
                    } catch (error) {
                        if (error instanceof ReturnError) {
                            if (frame.iseq.type != "method") {
                                throw new Error(`Expected frame type to be 'method', was '${frame.iseq.type}' instead`);
                            }

                            this.stack.splice(frame.stack_index);
                            this.frame = frame.parent;

                            return error.value;
                        } else if (error instanceof BreakError) {
                            if (frame.iseq.type != "block") {
                                throw new Error(`Expected frame type to be 'block', was '${frame.iseq.type}' instead`);
                            }

                            const catch_entry = this.find_catch_entry(frame, CatchBreak);

                            if (!catch_entry) {
                                throw new Error("Could not find catch entry");
                            }

                            this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                            this.frame = frame;

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.exit_label);
                            this.stack.push(result = error.value);
                        } else if (error instanceof NextError) {
                            if (frame.iseq.type != "block") {
                                throw new Error(`Expected frame type to be 'block', was '${frame.iseq.type}' instead`);
                            }

                            const catch_entry = this.find_catch_entry(frame, CatchNext);

                            if (!catch_entry) {
                                throw new Error("Could not find catch entry");
                            }

                            this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp);
                            this.frame = frame;

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.exit_label);
                            result = error.value
                            this.stack.push(result);
                        } else {
                            const catch_entry = this.find_catch_entry(frame, CatchRescue)

                            if (!catch_entry) {
                                throw error;
                            }

                            this.stack.splice!(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                            this.frame = frame;

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.exit_label);
                            result = this.run_rescue_frame(catch_entry.iseq!, frame, error as Error);
                            this.stack.push(result);
                        }
                    }

                    if (result instanceof JumpResult) {
                        frame.pc = frame.iseq.compiled_insns.indexOf(result.label) + 1;
                    } else if (result instanceof LeaveResult) {
                        // this shouldn't be necessary, but is because we're not handling
                        // the stack correctly at the moment
                        this.stack.splice(frame.stack_index);

                        // restore the previous frame
                        this.frame = previous || frame.parent;

                        return result.value;
                    } else {
                        frame.pc ++;
                    }
                }
            }
        }
    }

    run_top_frame(iseq: InstructionSequence): RValue {
        return this.run_frame(new TopFrame(iseq));
    }

    run_block_frame(iseq: InstructionSequence, frame: Frame, ...args: any[]): RValue {
        return this.run_frame(new BlockFrame(iseq, frame, this.stack.length), () => {
            return this.setup_arguments(iseq, args, null);
        });
    }

    run_class_frame(iseq: InstructionSequence, klass: RValue): RValue {
        return this.run_frame(new ClassFrame(iseq, this.frame!, this.stack.length, klass));
    }

    run_method_frame(name: string, nesting: RValue[], iseq: InstructionSequence, self: RValue, args: RValue[], block?: RValue): RValue {
        const method_frame = new MethodFrame(
            iseq,
            nesting,
            this.frame!,
            this.stack.length,
            self,
            name,
            block
        );

        return this.run_frame(method_frame, () => {
            return this.setup_arguments(iseq, args, block);
        });
    }

    run_rescue_frame(iseq: InstructionSequence, frame: Frame, error: Error): RValue {
        return this.run_frame(new RescueFrame(iseq, frame, this.stack.length), () => {
            // @TODO: support rescue
            // this.local_set(0, 0, error);
            return null
        });
    }

    private find_catch_entry<T extends CatchEntry>(frame: Frame, type: new (...args: any[]) => T) {
        const iseq = frame.iseq;

        for (const catch_entry of iseq.catch_table) {
            if (catch_entry instanceof type) {
                continue;
            }

            const begin_pc = iseq.compiled_insns.indexOf(catch_entry.begin_label);
            const end_pc = iseq.compiled_insns.indexOf(catch_entry.end_label);

            if (frame.pc >= begin_pc && frame.pc < end_pc) {
                return catch_entry;
            }
        }

        return null;
    }

    private frame_at(depth: number): Frame | null {
        let current: Frame = this.frame!;

        for (let i = 0; i < depth; i ++) {
            if (!current.parent) {
                return null;
            }

            current = current.parent;
        }

        return current;
    }

    local_get(index: number, depth: number): RValue {
        return this.stack[this.frame_at(depth)!.stack_index + index];
    }

    local_set(index: number, depth: number, value: RValue) {
        this.stack[this.frame_at(depth)!.stack_index + index] = value;
    }

    private setup_arguments(iseq: InstructionSequence, args: RValue[], block?: RValue | null): Label | null {
        let locals = [...args];
        let local_index = 0;
        let start_label: Label | null = null;

        // First, set up all of the leading arguments. These are positional and
        // required arguments at the start of the argument list.
        const lead_num = iseq.argument_options.lead_num;
        if (lead_num) {
            for (let i = 0; i < lead_num; i ++) {
                this.local_set(local_index, 0, locals.shift()!);
                local_index ++;
            }
        }

        // Next, set up all of the optional arguments. The opt array contains
        // the labels that the frame should start at if the optional is
        // present. The last element of the array is the label that the frame
        // should start at if all of the optional arguments are present.
        const opt = iseq.argument_options.opt;
        if (opt) {
            for (let i = 0; i < opt.length - 1; i ++) {
                if (locals.length == 0) {
                    start_label = opt[i];
                    break;
                } else {
                    this.local_set(local_index, 0, locals.shift()!);
                    local_index ++;
                }

                if (!start_label) {
                    start_label = opt[opt.length - 1];
                }
            }
        }

        // If there is a splat argument, then we'll set that up here. It will
        // grab up all of the remaining positional arguments.
        const rest_start = iseq.argument_options.rest_start;
        if (rest_start) {
            const post_start = iseq.argument_options.post_start;
            if (post_start) {
                const length = post_start - rest_start;
                this.local_set(local_index, 0, RubyArray.new(locals.slice(0, length - 1)));
                locals = locals.slice(length);
            } else {
                this.local_set(local_index, 0, RubyArray.new([...locals]))
                locals.length = 0;
            }

            local_index ++;
        }

        // Next, set up any post arguments. These are positional arguments that
        // come after the splat argument.
        const post_num = iseq.argument_options.post_num;
        if (post_num) {
            for (let i = 0; i < post_num; i ++) {
                this.local_set(local_index, 0, locals.shift()!);
                local_index ++;
            }
        }

        // @TODO: support keyword arguments
        // const keyword_option = iseq.argument_options.keyword;
        // if (keyword_option) {
        //     // First, set up the keyword bits array.
        //     const keyword_bits = keyword_option.map((config) => {
        //         kwargs.contains(config instanceof Array ? config[0] : config)
        //     });

        //     for (let i = 0; i < iseq.local_table.locals.length; i ++) {
        //         const local = iseq.local_table.locals[i];

        //         // If this is the keyword bits local, then set it appropriately.
        //         if (local.name instanceof Number) {
        //             this.local_set(i, 0, keyword_bits)
        //             continue;
        //         }

        //         // First, find the configuration for this local in the keywords
        //         // list if it exists.
        //         const name = local.name
        //         const config = (() => {
        //             for (let j = 0; j < keyword_option.length; j ++) {
        //                 const keyword = keyword_option[j];
        //                 if (keyword instanceof Array ? keyword[0] == name : keyword == name) {
        //                     return keyword;
        //                 }
        //             }

        //             return null;
        //         })();

        //         // If the configuration doesn't exist, then the local is not a
        //         // keyword local.
        //         if (!config) {
        //             continue;
        //         }

        //         if (!(config instanceof Array)) {
        //             // required keyword
        //             this.local_set(i, 0, kwargs.fetch(name));
        //         } else if (config[1]) {
        //             // optional keyword with embedded default value
        //             this.local_set(i, 0, kwargs.fetch(name, config[1]));
        //         } else {
        //             // optional keyword with expression default value
        //             this.local_set(i, 0, kwargs[name]);
        //         }
        //     }
        // }

        if (iseq.argument_options.block_start) {
            this.local_set(local_index, 0, block!);
        }

        return start_label;
    }

    pop(): RValue | undefined {
        return this.stack.pop()
    }

    jump(label: Label): JumpResult {
        return new JumpResult(label);
    }

    leave() {
        return new LeaveResult(this.stack.pop()!);
    }
}
