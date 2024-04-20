import { BlockCallData, CallData, CallDataFlag, MethodCallData } from "./call_data";
import { ArgumentError, LocalJumpError, NativeError, RubyError } from "./errors";
import { BlockFrame, ClassFrame, EnsureFrame, Frame, MethodFrame, RescueFrame, TopFrame } from "./frame";
import Instruction from "./instruction";
import { CatchBreak, CatchEnsure, CatchEntry, CatchNext, CatchRescue, InstructionSequence, Label } from "./instruction_sequence";
import { Local } from "./local_table";
import { ModuleClass, Class, ClassClass, RValue, STDOUT, IO, Qnil, STDERR, Qtrue, Qfalse, Runtime, RValuePointer, Module } from "./runtime";
import { Binding } from "./runtime/binding";
import { Hash } from "./runtime/hash";
import { Object } from "./runtime/object";
import { String } from "./runtime/string";
import { RubyArray } from "./runtime/array";
import { Proc } from "./runtime/proc";
import { ParameterMetadata } from "./runtime/parameter-meta";
import { LexicalScope } from "./compiler";
import Dup from "./insns/dup";

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
    public return_from_frame: Frame;

    constructor(value: RValue, return_from_frame: Frame) {
        super(value);

        this.return_from_frame = return_from_frame;
    }
}

export class BreakError extends ThrownError {
}

export class NextError extends ThrownError {
}

export class PauseError extends ThrownError {
}

export class ThrowError extends ThrownError {
    public tag: RValue;

    constructor(tag: RValue, value: RValue) {
        super(value);
        this.tag = tag;
    }
}

export enum CallingConvention {
    // Enforces passing all required positional arguments (applies to methods and lambdas)
    METHOD_LAMBDA = 1,

    // Assigns nil to missing positional arguments (applies to blocks and procs, but not lambdas converted to procs)
    BLOCK_PROC = 2
}

// This is the object that gets passed around all of the instructions as they
// are being executed.
export class ExecutionContext {
    static current: ExecutionContext;

    // The system stack that tracks values through the execution of the program.
    public stack: RValuePointer[];

    // The global variables accessible to the program. These mirror the runtime
    // global variables if they have not been overridden.
    public globals: {[key: string]: RValue};

    // The current frame.
    public frame: Frame | null;

    // The last top frame that was evaluated.
    public top_locals: Map<string, Local>;

    constructor() {
        this.stack = [];
        this.top_locals = new Map();

        this.globals = {
            '$:': RubyArray.new(),  // load path
            '$"': RubyArray.new(),  // loaded features
            '$,': Qnil,             // field separator for print and Array#join
            '$/': String.new("\n"), // line separator
            '$stdout': STDOUT,
            '$stderr': STDERR,
        };

        // The load path global is a "special" array with this singleton method (maybe others?)
        this.globals['$:'].get_singleton_class().get_data<Class>().tap((klass: Class) => {
            // This is used to look up "features," i.e. native extensions that are part of the
            // Ruby stdlib. I'm not sure how to handle this sort of thing right now, so let's
            // just return nil ¯\_(ツ)_/¯
            klass.define_native_method("resolve_feature_path", (self: RValue): RValue => {
                return Qnil;
            });
        })

        // global aliases
        this.globals['$LOAD_PATH'] = this.globals['$:'];
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

    define_method(object: RValue, name: string, iseq: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        if (object.klass === ClassClass || object.klass == ModuleClass) {
            object.get_data<Class>().define_method(name, iseq, parameters_meta, lexical_scope);
        } else {
            object.klass.get_data<Class>().define_method(name, iseq, parameters_meta, lexical_scope);
        }
    }

    run_frame(frame: Frame, cb?: () => Label | null): RValue {
        // Set the current frame to the given value.
        let previous = this.frame;
        this.frame = frame;

        // Next, set up the local table for the frame. This is actually incorrect
        // as it could use the values already on the stack, but for now we're
        // just doing this for simplicity.
        const locals = Array<RValuePointer>(frame.iseq.local_table.size());

        for (let i = 0; i < locals.length; i ++) {
            locals[i] = new RValuePointer(Qnil);
        }

        this.stack.push(...locals);

        // Yield so that some frame-specific setup can be done.
        const start_label = cb ? cb() : null;

        if (start_label) {
            frame.pc = frame.iseq.compiled_insns.indexOf(start_label);
        }

        return this.execute_frame(frame, previous);
    }

    execute_frame(frame: Frame, previous: Frame | null): RValue {
        this.frame = frame;

        // Finally we can execute the instructions one at a time. If they return
        // jump or leave we will handle those appropriately.
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
                        // for (const elem of this.stack) {
                        //     if (elem.rval === undefined) {
                        //         debugger;
                        //     }
                        // }
                    } catch (error) {
                        if (error instanceof ReturnError) {
                            this.frame = previous || frame.parent;
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
                            this.stack.push(new RValuePointer(result));
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
                            this.stack.push(new RValuePointer(result));
                        } else if (error instanceof PauseError) {
                            frame.pc += 1;
                            this.stack.splice(frame.stack_index);
                            this.frame = previous || frame.parent;
                            throw error;
                        } else {
                            // I really need to clean up errors and error handling, what a mess
                            if (error instanceof RubyError || error instanceof RValue) {
                                if (error instanceof RubyError) {
                                    error.backtrace ||= this.create_backtrace();
                                }

                                const catch_entry = this.find_catch_entry(frame, CatchRescue)
                                const ensure_entry = this.find_catch_entry(frame, CatchEnsure);
                                let error_rval;

                                if (error instanceof RValue) {
                                    error_rval = error;
                                } else {
                                    error_rval = error.to_rvalue();
                                }

                                if (!catch_entry) {
                                    if (ensure_entry) {
                                        this.run_ensure_frame(ensure_entry.iseq!, frame, error_rval);
                                    }

                                    // uncaught exception
                                    this.frame = frame;
                                    throw error;
                                }

                                this.stack.splice!(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                                this.frame = frame;

                                frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                                result = this.run_rescue_frame(catch_entry.iseq!, frame, error_rval);

                                if (ensure_entry) {
                                    this.run_ensure_frame(ensure_entry.iseq!, frame, Qnil);
                                }

                                this.stack.push(new RValuePointer(result));
                            } else {
                                // re-raise javascript errors
                                if (error instanceof ThrowError || error instanceof RubyError || error instanceof NativeError) {
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
                        // don't remove locals from top frames so they can be accessed by the
                        // next top frame, should there be one
                        // if (!(frame instanceof TopFrame)) {
                            // this shouldn't be necessary, but is because we're not handling
                            // the stack correctly at the moment
                            // this.stack.splice(frame.stack_index);
                        // }

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

    create_backtrace(start: number = 0, length: number = -1): string[] {
        const backtrace = [];
        let current: Frame | null = this.frame;
        let frame_idx = 0;

        while (current) {
            if (frame_idx >= start) {
                backtrace.push(`${current.iseq.file}:${current.line} in ${current.iseq.name}`);
            }

            current = current.parent;
            frame_idx ++;

            if (length != -1 && backtrace.length >= length) break;
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

    static print_backtrace_rval(rval: RValue) {
        const backtrace = Object.send(rval, "backtrace").get_data<RubyArray>().elements;
        const message = Object.send(rval, "message").get_data<string>();
        const stdout = STDOUT.get_data<IO>();

        stdout.puts(`${backtrace[0].get_data<string>()}: ${message} (${rval.klass.get_data<Class>().full_name})`);

        for (let i = 1; i < backtrace.length; i ++) {
            stdout.puts(`        ${backtrace[i].get_data<string>()}`);
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
        const new_top_frame = new TopFrame(iseq, stack_index);
        const result = this.run_frame(new_top_frame, () => {
            // @TODO: only set items on this.top_locals if they have been defined
            // for (const local of new_top_frame.iseq.local_table.locals) {
            //     if (!this.top_locals.has(local.name)) {
            //         this.top_locals.set(local.name, local);
            //     }
            // }

            return null;
        });

        return result;
    }

    // this is also used to call lambdas
    run_block_frame(call_data: BlockCallData, calling_convention: CallingConvention, iseq: InstructionSequence, binding: Binding, args: RValue[], kwargs?: Hash, owner?: Module, frame_callback?: (frame: BlockFrame) => void): RValue {
        const original_stack = this.stack;

        try {
            return this.with_stack(binding.stack, () => {
                const block_frame = new BlockFrame(call_data, calling_convention,iseq, binding, original_stack, args, kwargs, owner);
                frame_callback?.(block_frame);

                return this.run_frame(block_frame, () => {
                    return this.setup_arguments(call_data, calling_convention, iseq, args, kwargs, undefined);
                });
            });
        } catch (e) {
            if (e instanceof ReturnError && calling_convention === CallingConvention.METHOD_LAMBDA) {
                return e.value;
            }

            throw e;
        }
    }

    with_stack(stack: RValuePointer[], cb: () => RValue): RValue {
        const old_stack = this.stack;

        // Copy the stack here so block-owned locals aren't shared by separate
        // invocations of the same block.
        //
        // @TODO: Maybe only copy the stack if the block has locals of its own?
        this.stack = [...stack];

        try {
            return cb();
        } finally {
            this.stack = old_stack;
        }
    }

    run_class_frame(iseq: InstructionSequence, klass: RValue, nesting?: RValue[]): RValue {
        return this.run_frame(new ClassFrame(iseq, this.frame!, this.stack.length, klass, nesting));
    }

    run_method_frame(call_data: MethodCallData, nesting: RValue[], iseq: InstructionSequence, self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, owner?: Module): RValue {
        const method_frame = new MethodFrame(
            iseq,
            nesting,
            this.frame!,
            this.stack.length,
            self,
            call_data,
            args,
            kwargs,
            block,
            owner
        );

        try {
            const return_value = this.run_frame(method_frame, () => {
                return this.setup_arguments(call_data, CallingConvention.METHOD_LAMBDA, iseq, args, kwargs, block);
            });

            // problem: a successful method frame will have trimmed the stack by the time
            // we get here, so we'll have to trim it here instead so as not to affect any
            // code inside the ensure clause that might need to access locals
            const ensure_entry = this.find_catch_entry(method_frame, CatchEnsure);

            if (ensure_entry) {
                this.run_ensure_frame(ensure_entry.iseq!, method_frame, Qnil);
            }

            this.stack.splice(method_frame.stack_index);

            return return_value;
        } catch (e) {
            if (e instanceof ReturnError) {
                this.stack.splice(method_frame.stack_index);

                if (method_frame === e.return_from_frame) {
                    return e.value;
                }
            }

            throw e;
        }
    }

    run_rescue_frame(iseq: InstructionSequence, frame: Frame, error: RValue): RValue {
        return this.run_frame(new RescueFrame(iseq, frame, this.stack.length), () => {
            this.local_set(0, 0, error);
            return null
        });
    }

    run_ensure_frame(iseq: InstructionSequence, frame: Frame, error: RValue): RValue {
        return this.run_frame(new EnsureFrame(iseq, frame, this.stack.length), () => {
            this.local_set(0, 0, error);
            return null
        });
    }

    private find_catch_entry<T extends CatchEntry>(frame: Frame, type: new (...args: any[]) => T): T | null {
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

    // Ugh whyyy is this necessary? Can't we just use the indices in the local table?
    // Probably. I'd say a refactor is in order.
    private inc_local_index(local_index: number, iseq: InstructionSequence): number {
        if (iseq.local_table.locals.length <= local_index + 1) {
            return iseq.local_table.locals.length - 1;
        }

        if (iseq.local_table.locals[local_index + 1].name === "keyword_bits") {
            return local_index + 2;
        } else {
            return local_index + 1;
        }
    }

    private setup_arguments(call_data: CallData, calling_convention: CallingConvention, iseq: InstructionSequence, args: RValue[], kwargs?: Hash, block?: RValue | null): Label | null {
        let locals = [...args];
        let local_index = this.inc_local_index(-1, iseq);
        let start_label: Label | null = null;

        if (call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
            // splatted array is always the last element
            const splat_arr = locals[call_data.argc - 1];

            if (splat_arr && splat_arr.klass === RubyArray.klass) {
                locals.splice(call_data.argc - 1, 1, ...splat_arr.get_data<RubyArray>().elements);
            }
        }

        // Pop forwarded kwargs off the positional args array
        if (!kwargs && call_data.has_flag(CallDataFlag.KW_SPLAT_FWD)) {
            kwargs = locals.pop()!.get_data<Hash>();
        }

        if (!block && call_data && call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            if (locals.length > 0 && locals[locals.length - 1].klass === Proc.klass) {
                block = locals.pop();
            } else {
                // this code path should not be possible, raise an error?
            }
        }

        // First, set up all of the leading arguments. These are positional and
        // required arguments at the start of the argument list.
        let lead_num = iseq.argument_options.lead_num || 0;

        // Apparently blocks and procs destructure one level of their args automatically.
        // Eg. {}.map { |a, b| ... } automatically destructures [a, b] while {}.map { |a| ... } does not,
        // and instead passes a two-element array to the block.
        if (calling_convention === CallingConvention.BLOCK_PROC && lead_num > locals.length && locals[0]?.klass === RubyArray.klass) {
            const elements = [...locals[0].get_data<RubyArray>().elements];

            if (elements.length <= lead_num) {
                for (let i = 0; i < lead_num; i ++) {
                    this.local_set(local_index, 0, elements.shift() || Qnil);
                    local_index = this.inc_local_index(local_index, iseq);
                }

                elements.shift();
                lead_num = 0;
            }
        }

        for (let i = 0; i < lead_num; i ++) {
            // if calling a method or lambda, enforce required positional args
            if (calling_convention === CallingConvention.METHOD_LAMBDA && locals.length === 0) {
                throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected ${lead_num})`);
            }

            this.local_set(local_index, 0, locals.shift() || Qnil);
            local_index = this.inc_local_index(local_index, iseq);
        }

        const post_num = iseq.argument_options.post_num || 0;

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

                local_index = this.inc_local_index(local_index, iseq);
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

            local_index = this.inc_local_index(local_index, iseq);
        }

        // Next, set up any post arguments. These are positional arguments that
        // come after the splat argument.
        for (let i = 0; i < post_num; i ++) {
            this.local_set(local_index, 0, locals.shift()!);
            local_index = this.inc_local_index(local_index, iseq);
        }

        // If there is a keyword bits index (i.e. we were called with kwargs),
        // but neither the KWARG nor the KW_SPLAT flags are set, that means
        // keyword arguments have been passed as the last argument in the
        // positional args array (likely forwarded via ...).
        if (iseq.argument_options.keyword_bits_index != null && !call_data.has_flag(CallDataFlag.KWARG) && !call_data.has_flag(CallDataFlag.KW_SPLAT)) {
            if (locals.length > 0 && locals[locals.length - 1].klass === Hash.klass) {
                const kwargs_hash = locals.pop()!;
                kwargs ||= new Hash();

                kwargs_hash.get_data<Hash>().each((k, v) => {
                    kwargs!.set(k, v);
                });

                // Since locals is a copy of args, the original args array will
                // not have been changed at this point. We need to remove the kwargs
                // hash from the original args array, since it was added synthetically
                // by a previous call to setup_arguments.
                if (call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
                    const splat_arr = args[call_data.argc - 1];
                    splat_arr.get_data<RubyArray>().elements.pop();
                } else {
                    args.pop();
                }
            }
        }

        const keyword_option = iseq.argument_options.keyword;

        if (kwargs && kwargs.length > 0 && !keyword_option && !iseq.argument_options.keyword_rest_start) {
            throw new ArgumentError("no keywords accepted");
        }

        if (keyword_option) {
            // First, set up the keyword bits array.
            const keyword_bits = keyword_option.map((keyword) => !!kwargs && kwargs.has_symbol(keyword[0]));

            for (let i = 0; i < iseq.local_table.locals.length; i ++) {
                const local = iseq.local_table.locals[i];

                // If this is the keyword bits local, then set it appropriately.
                if (local.name === "keyword_bits") {
                    const keyword_bits_rval = RubyArray.new(keyword_bits.map((bit) => bit ? Qtrue : Qfalse));
                    this.local_set(i, 0, keyword_bits_rval);
                    continue;
                }

                // First, find the configuration for this local in the keywords
                // list if it exists.
                const name = local.name;
                const config = (() => {
                    for (let j = 0; j < keyword_option.length; j ++) {
                        const keyword = keyword_option[j];
                        if (keyword[0] == name) {
                            return keyword;
                        }
                    }

                    return null;
                })();

                // If the configuration doesn't exist, then the local is not a
                // keyword local.
                if (!config) {
                    continue;
                }

                if (config[1] === null) {
                    // required keyword
                    if (kwargs && kwargs.has_symbol(name)) {
                        this.local_set(i, 0, kwargs.get_by_symbol(name)!);
                    } else {
                        throw new ArgumentError(`missing keyword: ${Object.send(Runtime.intern(name), "inspect").get_data<string>()}`);
                    }
                } else {
                    // optional keyword with expression default value
                    this.local_set(i, 0, kwargs ? kwargs.get_by_symbol(name) || Qnil : Qnil);
                }

                if (kwargs) kwargs.delete_by_symbol(name);
                local_index = this.inc_local_index(local_index, iseq);
            }
        }

        if (iseq.argument_options.keyword_rest_start != null) {
            let kwargs_hash = kwargs || new Hash();

            if (iseq.argument_options.keyword_rest_start === -1) {
                const lookup = iseq.local_table.find_or_throw("*");

                // avoid mutating original args array
                const old_args = this.local_get(lookup.index, lookup.depth).get_data<RubyArray>().elements;
                this.local_set(lookup.index, lookup.depth, RubyArray.new([...old_args, Hash.from_hash(kwargs_hash)]));
            } else {
                this.local_set(local_index, 0, kwargs ? Hash.from_hash(kwargs) : Hash.new());
                local_index = this.inc_local_index(local_index, iseq);
            }
        }

        // Add any remaining (positional) locals, as they can be referenced using numbered parameter syntax, eg _n
        if (calling_convention === CallingConvention.BLOCK_PROC) {
            while (locals.length > 0) {
                this.local_set(local_index, 0, locals.shift()!);
                local_index = this.inc_local_index(local_index, iseq);
            }
        }

        if (iseq.argument_options.block_start != null) {
            this.local_set(local_index, 0, block ? block : Qnil);
        }

        return start_label;
    }

    pop(): RValue | undefined {
        return this.stack.pop()?.rval;
    }

    push(...values: RValue[]): void {
        this.stack.push(...values.map(val => new RValuePointer(val)));
    }

    peek(): RValue {
        return this.stack[this.stack.length - 1].rval;
    }

    get stack_len(): number {
        return this.stack.length;
    }

    popn(n: number = 1): RValue[] {
        return this.stack.splice(this.stack.length - n, n).map(ptr => ptr.rval);
    }

    topn(n: number): RValue {
        return this.stack[this.stack_len - n - 1].rval;
    }

    setn(n: number, value: RValue): void {
        this.stack[this.stack_len - (n + 1)].rval = value;
    }

    jump(label: Label): JumpResult {
        return new JumpResult(label);
    }

    leave() {
        return new LeaveResult(this.stack.pop()!.rval);
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
