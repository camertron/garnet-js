import { BlockCallData, CallData, CallDataFlag, MethodCallData } from "./call_data";
import { LocalJumpError, NativeError, RubyError } from "./errors";
import { BlockFrame, ClassFrame, Frame, MethodFrame, RescueFrame, TopFrame } from "./frame";
import Instruction from "./instruction";
import { CatchBreak, CatchEntry, CatchNext, CatchRescue, InstructionSequence, Label } from "./instruction_sequence";
import { Array as RubyArray, ModuleClass, Class, ClassClass, RValue, String, STDOUT, IO, Qnil, STDERR, ArrayClass, ProcClass } from "./runtime";
import { Binding } from "./runtime/binding";

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

    constructor(value: RValue) {
        super("This error was thrown by the Ruby VM.");
        this.value = value;
    }
}

export class ReturnError extends ThrownError {
}

export class BreakError extends ThrownError {
}

export class NextError extends ThrownError {
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

    // Call data for the current method, block, proc, or lambda being executed
    public call_data: CallData;

    constructor() {
        this.stack = [];

        this.globals = {
            '$:': RubyArray.new(),  // load path
            '$"': RubyArray.new(),  // loaded features
            '$,': Qnil,             // field separator for print and Array#join
            '$/': String.new("\n"), // line separator
            '$stdout': STDOUT,
            '$stderr': STDERR,
        };
    }

    push_onto_load_path(path: string) {
        this.globals["$:"].get_data<RubyArray>().elements.push(String.new(path));
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
        this.stack.push(...Array(frame.iseq.local_table.size()).fill(Qnil));

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

                        // @TODO: remove me
                        // @ts-ignore
                        if (this.stack.includes(undefined)) {
                            debugger;
                        }
                    } catch (error) {
                        if (error instanceof ReturnError) {
                            let method_frame: Frame = this.frame;

                            while (method_frame.iseq.type != "method") {
                                if (!method_frame.parent) break;
                                method_frame = method_frame.parent;
                            }

                            if (!method_frame) {
                                throw new LocalJumpError("unexpected return");
                            }

                            this.stack.splice(method_frame.stack_index);
                            this.frame = previous || method_frame.parent; // implicit Leave

                            throw error;
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

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                            result = error.value;
                            this.stack.push(result);
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

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                            result = error.value
                            this.stack.push(result);
                        } else {
                            if (error instanceof RubyError) {
                                error.backtrace ||= this.create_backtrace();

                                const catch_entry = this.find_catch_entry(frame, CatchRescue)

                                if (!catch_entry) {
                                    // uncaught exception
                                    throw error;
                                }

                                this.stack.splice!(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                                this.frame = frame;

                                frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                                result = this.run_rescue_frame(catch_entry.iseq!, frame, error.to_rvalue());
                                this.stack.push(result);
                            } else {
                                // re-raise javascript errors
                                if (error instanceof RubyError || error instanceof NativeError) {
                                    throw error
                                } else if (error instanceof Error) {
                                    throw new NativeError(error, this.create_backtrace());
                                } else {
                                    throw error;
                                }
                            }
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

    create_backtrace(): string[] {
        let current: Frame | null = this.frame;
        const backtrace = [];

        while (current) {
            backtrace.push(`${current.iseq.file}:${current.line + 1} in ${current.iseq.name}`);
            current = current.parent;
        }

        return backtrace;
    }

    create_backtrace_rvalue(): RValue {
        const backtrace = this.create_backtrace();
        const lines = backtrace.map(line => String.new(line));
        return RubyArray.new(lines);
    }

    static print_backtrace(e: any) {
        const backtrace = e.backtrace;
        const stdout = STDOUT.get_data<IO>();

        stdout.puts(`${backtrace[0]}: ${e.message} (${e.constructor.name})`);

        for (let i = 1; i < backtrace.length; i ++) {
            stdout.puts(`        ${backtrace[i]}`);
        }
    }

    static print_backtrace_to_string(e: any): string {
        const backtrace = e.backtrace as string[];
        const lines = [`${backtrace[0]}: ${e.message} (${e.constructor.name})`];

        for (let i = 1; i < backtrace.length; i ++) {
            lines.push(`        ${backtrace[i]}`);
        }

        return lines.join("\n");
    }

    frame_yield(): MethodFrame | null {
        let current: Frame | null = this.frame;

        while (!(current instanceof MethodFrame)) {
            if (current) {
                current = current.parent;
            } else {
                return null;
            }
        }

        return current;
    }

    frame_svar(): Frame | null {
      let current = this.frame;

      while (current instanceof BlockFrame) {
        current = current.parent;
      }

      return current;
    }

    run_top_frame(iseq: InstructionSequence, stack_index?: number): RValue {
        return this.run_frame(new TopFrame(iseq, stack_index));
    }

    run_block_frame(call_data: BlockCallData, iseq: InstructionSequence, binding: Binding, args: RValue[]): RValue {
        const original_stack = this.stack;

        return this.with_stack(binding.stack, () => {
            return this.run_frame(new BlockFrame(call_data, iseq, binding, original_stack), () => {
                return this.setup_arguments(call_data, iseq, args, null);
            });
        });
    }

    private with_stack(stack: RValue[], cb: () => RValue): RValue {
        const old_stack = this.stack;
        this.stack = stack;

        try {
            return cb();
        } finally {
            this.stack = old_stack;
        }
    }

    run_class_frame(iseq: InstructionSequence, klass: RValue): RValue {
        return this.run_frame(new ClassFrame(iseq, this.frame!, this.stack.length, klass));
    }

    run_method_frame(call_data: MethodCallData, nesting: RValue[], iseq: InstructionSequence, self: RValue, args: RValue[], block?: RValue): RValue {
        const method_frame = new MethodFrame(
            iseq,
            nesting,
            this.frame!,
            this.stack.length,
            self,
            call_data,
            args,
            block
        );

        try {
            return this.run_frame(method_frame, () => {
                return this.setup_arguments(call_data, iseq, args, block);
            });
        } catch (e) {
            if (e instanceof ReturnError) {
                return e.value;
            } else {
                throw e;
            }
        }
    }

    run_rescue_frame(iseq: InstructionSequence, frame: Frame, error: RValue): RValue {
        return this.run_frame(new RescueFrame(iseq, frame, this.stack.length), () => {
            this.local_set(0, 0, error);
            return null
        });
    }

    private find_catch_entry<T extends CatchEntry>(frame: Frame, type: new (...args: any[]) => T) {
        const iseq = frame.iseq;

        for (const catch_entry of iseq.catch_table.entries) {
            if (!(catch_entry instanceof type)) {
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

    local_get(index: number, depth: number): RValue {
        return this.frame!.local_get(this, index, depth);
    }

    local_set(index: number, depth: number, value: RValue) {
        this.frame!.local_set(this, index, depth, value);
    }

    get const_base() {
        return this.frame!.nesting![this.frame!.nesting.length - 1];
    }

    private setup_arguments(call_data: CallData, iseq: InstructionSequence, args: RValue[], block?: RValue | null): Label | null {
        let locals = [...args];
        let local_index = 0;
        let start_label: Label | null = null;

        if (call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
            locals = locals.flatMap((elem) => {
                // @TODO: we should probably check for respond_to?(:to_ary) here
                if (elem.klass === ArrayClass) {
                    return elem.get_data<RubyArray>().elements;
                } else {
                    return elem;
                }
            })
        }

        if (!block && call_data && call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            if (locals.length > 0 && locals[locals.length - 1].klass === ProcClass) {
                block = locals.pop();
            } else {
                // raise an error?
            }
        }

        const post_num = iseq.argument_options.post_num || 0;

        // First, set up all of the leading arguments. These are positional and
        // required arguments at the start of the argument list.
        const lead_num = iseq.argument_options.lead_num || 0;
        for (let i = 0; i < lead_num; i ++) {
            this.local_set(local_index, 0, locals.shift()!);
            local_index ++;
        }

        // Next, set up all of the optional arguments. The opt array contains
        // the labels that the frame should start at if the optional is
        // present. The last element of the array is the label that the frame
        // should start at if all of the optional arguments are present.
        const opt = iseq.argument_options.opt;
        if (opt) {
            for (let i = 0; i < opt.length - 1; i ++) {
                // Posts are required args and are populated before optionals.
                // Therefore, if there won't be enough locals to fill in our required posts,
                // stop assigning optionals.
                const optionals_done = locals.length == 0 || (post_num > 0 && locals.length <= post_num);

                if (optionals_done) {
                    if (!start_label) {
                        start_label = opt[i];
                    }
                } else {
                    this.local_set(local_index, 0, locals.shift()!);
                }

                local_index ++;
            }

            if (!start_label) {
                start_label = opt[opt.length - 1];
            }
        }

        // If there is a splat argument, then we'll set that up here. It will
        // grab up all of the remaining positional arguments.
        if (iseq.argument_options.rest_start != null) {
            if (iseq.argument_options.post_start != null) {
                const length = locals.length - (iseq.argument_options.post_num || 0);
                this.local_set(local_index, 0, RubyArray.new(locals.splice(0, length)));
                // locals = locals.slice(length);
            } else {
                this.local_set(local_index, 0, RubyArray.new([...locals]))
                locals.length = 0;
            }

            local_index ++;
        }

        // Next, set up any post arguments. These are positional arguments that
        // come after the splat argument.
        for (let i = 0; i < post_num; i ++) {
            this.local_set(local_index, 0, locals.shift()!);
            local_index ++;
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

        if (iseq.argument_options.block_start != null) {
            this.local_set(local_index, 0, block ? block : Qnil);
        }

        return start_label;
    }

    pop(): RValue | undefined {
        return this.stack.pop();
    }

    push(...values: RValue[]): void {
        this.stack.push(...values);
    }

    peek(): RValue {
        return this.stack[this.stack.length - 1];
        // return this.stack.get(this.stack.length - 1);
    }

    get stack_len(): number {
        return this.stack.length;
    }

    popn(n: number = 1): RValue[] {
        return this.stack.splice(this.stack.length - n, n);
    }

    topn(n: number): RValue {
        return this.stack[this.stack_len - n - 1];
    }

    setn(n: number, value: RValue): void {
        this.stack[this.stack_len - n - 1] = value;
    }

    jump(label: Label): JumpResult {
        return new JumpResult(label);
    }

    leave() {
        return new LeaveResult(this.stack.pop()!);
    }

    get_binding(): Binding {
        return new Binding(
            this.frame!.self,
            this.frame!.nesting,
            [...this.stack],
            this.frame!,
            this.stack_len
        );
    }
}
