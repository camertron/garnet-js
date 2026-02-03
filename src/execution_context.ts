import { BlockCallData, CallData, CallDataFlag, MethodCallData } from "./call_data";
import { ArgumentError, LocalJumpError, NativeError, RubyError } from "./errors";
import { BlockFrame, ClassFrame, EnsureFrame, Frame, IFrameWithOwner, MethodFrame, RescueFrame, TopFrame } from "./frame";
import Instruction from "./instruction";
import { CatchBreak, CatchEnsure, CatchEntry, CatchNext, CatchRescue, InstructionSequence, Label } from "./instruction_sequence";
import { Local } from "./local_table";
import { ModuleClass, Class, ClassClass, RValue, STDOUT, IO, Qnil, STDERR, Qtrue, Qfalse, Runtime, RValuePointer, Module, ObjectClass } from "./runtime";
import { Binding } from "./runtime/binding";
import { Hash } from "./runtime/hash";
import { Object } from "./runtime/object";
import { RubyString } from "./runtime/string";
import { RubyArray } from "./runtime/array";
import { Proc } from "./runtime/proc";
import { ParameterMetadata } from "./runtime/parameter-meta";
import { LexicalScope } from "./compiler";
import { Mutex } from "./util/mutex";

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

export enum ThrowType {
    NONE = 0x0,
    RETURN = 0x1,
    BREAK = 0x2,
    NEXT = 0x3,
    RETRY = 0x4,
    REDO = 0x5,
    RAISE = 0x6,
    THROW = 0x7,
    FATAL = 0x8,
    PAUSE = 0x9  // this one is not standard
}

abstract class ThrownError extends Error {
    public value: RValue;

    constructor(value: RValue) {
        super("This error was thrown by the Ruby VM.");
        this.value = value;
    }

    abstract get type(): number;
}

export class ThrowNoneError extends ThrownError {
    get type(): number {
        return ThrowType.NONE;
    }
}

export class ReturnError extends ThrownError {
    public return_from_frame: Frame;

    constructor(value: RValue, return_from_frame: Frame) {
        super(value);

        this.return_from_frame = return_from_frame;
    }

    override get type(): number {
        return ThrowType.RETURN;
    }
}

export class BreakError extends ThrownError {
    override get type(): number {
        return ThrowType.BREAK;
    }
}

export class NextError extends ThrownError {
    override get type(): number {
        return ThrowType.NEXT;
    }
}

export class RetryError extends ThrownError {
    override get type(): number {
        return ThrowType.RETRY;
    }
}

export class PauseError extends ThrownError {
    override get type(): number {
        return ThrowType.PAUSE;
    }
}

// Used for an actual ruby `throw` statement
export class ThrowError extends ThrownError {
    public tag: RValue;

    constructor(tag: RValue, value: RValue) {
        super(value);
        this.tag = tag;
    }

    override get type(): number {
        return ThrowType.THROW;
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

    // Maps global variable names to their canonical names for aliasing
    public global_aliases: {[key: string]: string};

    // The current frame.
    public frame: Frame | null;

    // The last top frame that was evaluated.
    public top_locals: Map<string, Local>;

    // The global VM lock
    public gvl: Mutex = new Mutex();

    private static next_id: number = 0;
    public id: number;

    constructor() {
        this.stack = [];
        this.top_locals = new Map();
        this.global_aliases = {};
        this.id = ExecutionContext.next_id ++;
    }

    static async create(): Promise<ExecutionContext> {
        const ec = new ExecutionContext();
        await ec.init();
        return ec;
    }

    async init() {
        this.globals = {
            '$:': await RubyArray.new(),      // load path
            '$"': await RubyArray.new(),      // loaded features
            '$,': Qnil,                       // field separator for print and Array#join
            '$/': await RubyString.new("\n"), // line separator
            '$stdout': STDOUT,
            '$stderr': STDERR,
        };

        // The load path global is a "special" array with this singleton method (maybe others?)
        await this.globals['$:'].get_singleton_class().get_data<Class>().tap(async (klass: Class) => {
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

    async push_onto_load_path(path: string) {
        this.globals["$:"].get_data<RubyArray>().elements.push(await RubyString.new(path));
    }

    // resolve global to canonical name, following aliases
    resolve_global_alias(name: string): string {
        let current = name;
        const visited = new Set<string>();

        while (this.global_aliases[current]) {
            if (visited.has(current)) {
                // circular alias detected, return current
                return current;
            }

            visited.add(current);
            current = this.global_aliases[current];
        }

        return current;
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

    async run_frame(frame: Frame, cb?: () => Promise<Label | null>): Promise<RValue> {
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
        const start_label = cb ? await cb() : null;

        if (start_label) {
            frame.pc = frame.iseq.compiled_insns.indexOf(start_label);
        }

        return await this.execute_frame(frame, previous);
    }

    async execute_frame(frame: Frame, previous: Frame | null): Promise<RValue> {
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

                case RubyString:
                    frame.pc += 1;
                    break;

                case Label:
                    // skip labels
                    frame.pc += 1;
                    break;

                default: {
                    let result: ExecutionResult | RValue = null;

                    try {
                        result = await (insn as Instruction).call(this);

                        // @TODO: remove me
                        // @ts-ignore
                        // for (const elem of this.stack) {
                        //     if (!elem.rval) {
                        //         debugger;
                        //     }
                        // }
                    } catch (error) {
                        if (error instanceof ThrowNoneError) {
                            // ThrowNoneError is used to signal the end of a rescue or ensure block
                            // when there's no exception to re-raise. Just treat it as normal completion.
                            if (frame.iseq.type === "rescue" || frame.iseq.type === "ensure") {
                                this.frame = previous || frame.parent;
                                return error.value;
                            }
                            // If we're not in a rescue or ensure frame, this is unexpected
                            throw new Error("ThrowNoneError thrown outside of rescue/ensure frame");
                        } else if (error instanceof ReturnError) {
                            this.frame = previous || frame.parent;
                            throw error;
                        } else if (error instanceof BreakError) {
                            // If we're in a rescue or ensure frame, propagate the error up to the parent frame
                            if (frame.iseq.type === "rescue" || frame.iseq.type === "ensure") {
                                this.frame = previous || frame.parent;
                                throw error;
                            }

                            if (frame.iseq.type != "block") {
                                throw new Error(`Expected frame type to be 'block', was '${frame.iseq.type}' instead`);
                            }

                            const catch_entry = this.find_catch_entry(frame, CatchBreak);

                            if (!catch_entry) {
                                // No catch entry in this block frame, so propagate the error up
                                this.frame = previous || frame.parent;
                                throw error;
                            }

                            this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                            this.frame = frame;

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                            result = error.value;
                            this.stack.push(new RValuePointer(result));
                        } else if (error instanceof NextError) {
                            // If we're in a rescue or ensure frame, propagate the error up to the parent frame
                            if (frame.iseq.type === "rescue" || frame.iseq.type === "ensure") {
                                this.frame = previous || frame.parent;
                                throw error;
                            }

                            if (frame.iseq.type != "block") {
                                throw new Error(`Expected frame type to be 'block', was '${frame.iseq.type}' instead`);
                            }

                            const catch_entry = this.find_catch_entry(frame, CatchNext);

                            if (!catch_entry) {
                                // No catch entry in this block frame, so propagate the error up
                                this.frame = previous || frame.parent;
                                throw error;
                            }

                            this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp);
                            this.frame = frame;

                            frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);
                            result = error.value
                            this.stack.push(new RValuePointer(result));
                        } else if (error instanceof RetryError) {
                            // if we're in a rescue or ensure frame, propagate the error up to the parent frame
                            if (frame.iseq.type === "rescue" || frame.iseq.type === "ensure") {
                                this.frame = previous || frame.parent;
                                throw error;
                            }

                            // `retry` should only be used from within a rescue block
                            throw new LocalJumpError("Invalid retry");
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
                                    error_rval = await error.to_rvalue();
                                }

                                if (!catch_entry) {
                                    if (ensure_entry) {
                                        await this.run_ensure_frame(ensure_entry.iseq!, frame, error_rval);
                                    }

                                    // uncaught exception
                                    this.frame = frame;
                                    throw error;
                                }

                                this.stack.splice!(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp)
                                this.frame = frame;

                                frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.cont_label);

                                try {
                                    result = await this.run_rescue_frame(catch_entry.iseq!, frame, error_rval);

                                    if (ensure_entry) {
                                        await this.run_ensure_frame(ensure_entry.iseq!, frame, Qnil);
                                    }

                                    this.stack.push(new RValuePointer(result));
                                } catch (e) {
                                    // If a NextError, BreakError, or RetryError is thrown from within the rescue frame,
                                    // we need to handle it here in the context of the current frame (block frame)
                                    if (e instanceof RetryError) {
                                        // `retry` should jump back to the beginning of the begin block
                                        this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + catch_entry.restore_sp);
                                        this.frame = frame;

                                        frame.pc = frame.iseq.compiled_insns.indexOf(catch_entry.begin_label);
                                        result = Qnil;
                                        // don't push anything - we're jumping back to re-execute
                                    } else if (e instanceof NextError) {
                                        if (ensure_entry) {
                                            await this.run_ensure_frame(ensure_entry.iseq!, frame, Qnil);
                                        }

                                        // Handle the next in the context of the current frame
                                        if (frame.iseq.type != "block") {
                                            throw new Error(`Expected frame type to be 'block', was '${frame.iseq.type}' instead`);
                                        }

                                        const next_catch_entry = this.find_catch_entry(frame, CatchNext);

                                        if (!next_catch_entry) {
                                            throw new Error("Could not find catch entry for next");
                                        }

                                        this.stack.splice(frame.stack_index + frame.iseq.local_table.size() + next_catch_entry.restore_sp);
                                        this.frame = frame;

                                        frame.pc = frame.iseq.compiled_insns.indexOf(next_catch_entry.cont_label);
                                        result = e.value;
                                        this.stack.push(new RValuePointer(result));
                                    } else if (e instanceof BreakError) {
                                        if (ensure_entry) {
                                            await this.run_ensure_frame(ensure_entry.iseq!, frame, Qnil);
                                        }

                                        // Re-throw the BreakError so it can be handled by the outer catch block
                                        // which will propagate it up to the parent frame
                                        throw e;
                                    } else {
                                        throw e;
                                    }
                                }
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

    async create_backtrace_rvalue(): Promise<RValue> {
        const backtrace = this.create_backtrace();
        const lines = await Promise.all(backtrace.map(line => RubyString.new(line)));
        return await RubyArray.new(lines);
    }

    static print_backtrace(e: any) {
        const backtrace = e.backtrace;
        const stdout = STDOUT.get_data<IO>();

        if (!backtrace || backtrace.length === 0) {
            stdout.puts(`${e.message} (${e.constructor.name})`);
            return;
        }

        stdout.puts(`${backtrace[0]}: ${e.message} (${e.constructor.name})`);

        for (let i = 1; i < backtrace.length; i ++) {
            stdout.puts(`        ${backtrace[i]}`);
        }
    }

    static async print_backtrace_rval(rval: RValue) {
        const backtrace = (await Object.send(rval, "backtrace")).get_data<RubyArray>().elements;
        const message = (await Object.send(rval, "message")).get_data<string>();
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

    topmost_method_frame_matching_current_lexical_scope(): MethodFrame | null {
        const lexical_scope = this.frame!.iseq.lexical_scope;
        let current_frame = this.frame;
        let topmost_matching: MethodFrame | null = null;

        while (current_frame) {
            if (current_frame instanceof MethodFrame && current_frame.iseq.lexical_scope.id === lexical_scope.id) {
                topmost_matching = current_frame;
            }

            current_frame = current_frame.parent;
        }

        return topmost_matching;
    }

    async run_top_frame(iseq: InstructionSequence, stack_index?: number): Promise<RValue> {
        const new_top_frame = new TopFrame(iseq, stack_index);
        const result = await this.run_frame(new_top_frame, () => {
            // @TODO: only set items on this.top_locals if they have been defined
            // for (const local of new_top_frame.iseq.local_table.locals) {
            //     if (!this.top_locals.has(local.name)) {
            //         this.top_locals.set(local.name, local);
            //     }
            // }

            return Promise.resolve(null);
        });

        return result;
    }

    // this is also used to call lambdas
    async run_block_frame(call_data: BlockCallData, calling_convention: CallingConvention, iseq: InstructionSequence, binding: Binding, args: RValue[], kwargs?: Hash, block?: RValue, owner?: Module, frame_callback?: (frame: BlockFrame) => void): Promise<RValue> {
        const original_stack = this.stack;

        // if no owner is passsed, inherit it from the binding's parent
        if (!owner && binding.parent_frame) {
            const parent = binding.parent_frame as IFrameWithOwner;

            if (parent.owner) {
                owner = parent.owner;
            }
        }

        try {
            return await this.with_stack(binding.stack, async () => {
                const block_frame = new BlockFrame(call_data, calling_convention,iseq, binding, original_stack, args, kwargs, block, owner);
                frame_callback?.(block_frame);

                return await this.run_frame(block_frame, async () => {
                    return await this.setup_arguments(call_data, calling_convention, iseq, args, kwargs, block);
                });
            });
        } catch (e) {
            if (e instanceof ReturnError && calling_convention === CallingConvention.METHOD_LAMBDA) {
                return e.value;
            }

            throw e;
        }
    }

    async with_stack(stack: RValuePointer[], cb: () => Promise<RValue>): Promise<RValue> {
        const old_stack = this.stack;

        // Copy the stack here so block-owned locals aren't shared by separate
        // invocations of the same block.
        //
        // @TODO: Maybe only copy the stack if the block has locals of its own?
        this.stack = [...stack];

        try {
            return await cb();
        } finally {
            this.stack = old_stack;
        }
    }

    async run_class_frame(iseq: InstructionSequence, klass: RValue, nesting?: RValue[]): Promise<RValue> {
        return await this.run_frame(new ClassFrame(iseq, this.frame!, this.stack.length, klass, nesting));
    }

    async run_method_frame(call_data: MethodCallData, nesting: RValue[], iseq: InstructionSequence, self: RValue, args: RValue[], kwargs?: Hash, block?: RValue, owner?: Module): Promise<RValue> {
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
            const return_value = await this.run_frame(method_frame, () => {
                return this.setup_arguments(call_data, CallingConvention.METHOD_LAMBDA, iseq, args, kwargs, block);
            });

            // problem: a successful method frame will have trimmed the stack by the time
            // we get here, so we'll have to trim it here instead so as not to affect any
            // code inside the ensure clause that might need to access locals
            const ensure_entry = this.find_catch_entry(method_frame, CatchEnsure);

            if (ensure_entry) {
                await this.run_ensure_frame(ensure_entry.iseq!, method_frame, Qnil);
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

    async run_rescue_frame(iseq: InstructionSequence, frame: Frame, error: RValue): Promise<RValue> {
        return await this.run_frame(new RescueFrame(iseq, frame, this.stack.length), () => {
            this.local_set(0, 0, error);
            this.globals["$!"] = error;
            return Promise.resolve(null);
        });
    }

    async run_ensure_frame(iseq: InstructionSequence, frame: Frame, error: RValue): Promise<RValue> {
        return await this.run_frame(new EnsureFrame(iseq, frame, this.stack.length), () => {
            this.local_set(0, 0, error);
            return Promise.resolve(null);
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
        const nesting = this.frame!.nesting!;

        // if nesting is empty (e.g., in a top-level method), return ObjectClass
        // since top-level methods are defined on Object
        if (nesting.length === 0) {
            return ObjectClass;
        }

        return nesting[nesting.length - 1];
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

    private async setup_arguments(call_data: CallData, calling_convention: CallingConvention, iseq: InstructionSequence, args: RValue[], kwargs?: Hash, block?: RValue | null): Promise<Label | null> {
        let locals = [...args];
        let local_index = this.inc_local_index(-1, iseq);
        let start_label: Label | null = null;

        if (call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
            // splatted array is always the last element
            const splat_arr = locals[call_data.argc - 1];

            if (splat_arr && splat_arr.klass === await RubyArray.klass()) {
                locals.splice(call_data.argc - 1, 1, ...splat_arr.get_data<RubyArray>().elements);
            }
        }

        // Method was passed kwargs but does not accept them; pass kwargs as last positional arg.
        if (iseq.argument_options.keyword_bits_index === null && iseq.argument_options.keyword_rest_start === null && kwargs) {
            locals.push(await Hash.from_hash(kwargs));
            kwargs = undefined;
        }

        if (!block && call_data && call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
            if (locals.length > 0 && locals[locals.length - 1].klass === await Proc.klass()) {
                block = locals.pop();
            } else {
                // this code path should not be possible, raise an error?
            }
        }

        // First, set up all of the leading arguments. These are positional and
        // required arguments at the start of the argument list.
        let lead_num = iseq.argument_options.lead_num || 0;
        const post_num = iseq.argument_options.post_num || 0;

        // Apparently blocks and procs destructure one level of their args automatically.
        // Eg. {}.map { |a, b| ... } automatically destructures [a, b] while {}.map { |a| ... } does not,
        // and instead passes a two-element array to the block.
        if (calling_convention === CallingConvention.BLOCK_PROC && lead_num > locals.length && locals[0]?.klass === await RubyArray.klass()) {
            const elements = [...locals[0].get_data<RubyArray>().elements];

            if (elements.length <= lead_num) {
                for (let i = 0; i < lead_num; i ++) {
                    this.local_set(local_index, 0, elements.shift() || Qnil);
                    local_index = this.inc_local_index(local_index, iseq);
                }

                elements.shift();
                lead_num = 0;

                // remove the destructured array from locals so it doesn't get assigned again
                locals.shift();
            }
        }

        for (let i = 0; i < lead_num; i ++) {
            // if calling a method or lambda, enforce required positional args
            if (calling_convention === CallingConvention.METHOD_LAMBDA && locals.length === 0) {
                throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected ${lead_num + post_num})`);
            }

            this.local_set(local_index, 0, locals.shift() || Qnil);
            local_index = this.inc_local_index(local_index, iseq);
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

                local_index = this.inc_local_index(local_index, iseq);
            }

            if (!start_label) {
                start_label = opt[opt.length - 1];
            }
        }

        // If there is a splat argument, then we'll set that up here. It will
        // slurp up all of the remaining positional arguments.
        if (iseq.argument_options.rest_start != null) {
            // check if there's a named splat parameter in the local table
            const rest_lookup = iseq.local_table.find("*");

            if (rest_lookup) {
                // named splat (forwarding)
                if (iseq.argument_options.post_start != null) {
                    const length = locals.length - (iseq.argument_options.post_num || 0);
                    this.local_set(rest_lookup.index, 0, await RubyArray.new(locals.splice(0, length)));
                } else {
                    this.local_set(rest_lookup.index, 0, await RubyArray.new([...locals]))
                    locals.length = 0;
                }

                local_index = this.inc_local_index(local_index, iseq);
            } else if (local_index >= 0) {
                // named splat
                if (iseq.argument_options.post_start != null) {
                    const length = locals.length - (iseq.argument_options.post_num || 0);
                    this.local_set(local_index, 0, await RubyArray.new(locals.splice(0, length)));
                } else {
                    this.local_set(local_index, 0, await RubyArray.new([...locals]))
                    locals.length = 0;
                }

                local_index = this.inc_local_index(local_index, iseq);
            } else {
                // anonymous splat, discard remaining arguments
                locals.length = 0;
            }
        }

        // Next, set up any post arguments. These are positional arguments that
        // come after the splat argument.
        for (let i = 0; i < post_num; i ++) {
            // if calling a method or lambda, enforce required positional args
            if (calling_convention === CallingConvention.METHOD_LAMBDA && locals.length === 0) {
                throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected ${lead_num + post_num})`);
            }

            this.local_set(local_index, 0, locals.shift() || Qnil);
            local_index = this.inc_local_index(local_index, iseq);
        }

        // If there is a keyword bits index (i.e. we were called with kwargs),
        // but neither the KWARG nor the KW_SPLAT flags are set, that means
        // keyword arguments have been passed as the last argument in the
        // positional args array (perhaps forwarded via ...).
        if (iseq.argument_options.keyword_bits_index != null && !call_data.has_flag(CallDataFlag.KWARG) && !call_data.has_flag(CallDataFlag.KW_SPLAT)) {
            if (locals.length > 0 && locals[locals.length - 1].klass === await Hash.klass()) {
                const kwargs_hash = locals.pop()!;
                kwargs ||= new Hash();

                await kwargs_hash.get_data<Hash>().each(async (k, v) => {
                    await kwargs!.set(k, v);
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

        if (kwargs && kwargs.length > 0 && !keyword_option && iseq.argument_options.keyword_rest_start === null) {
            throw new ArgumentError("no keywords accepted");
        }

        if (keyword_option) {
            // First, set up the keyword bits array.
            const keyword_bits = await Promise.all(
                keyword_option.map(async (keyword) => !!kwargs && await kwargs.has_symbol(keyword[0]))
            );

            for (let i = 0; i < iseq.local_table.locals.length; i ++) {
                const local = iseq.local_table.locals[i];

                // If this is the keyword bits local, then set it appropriately.
                if (local.name === "keyword_bits") {
                    const keyword_bits_rval = await RubyArray.new(keyword_bits.map((bit) => bit ? Qtrue : Qfalse));
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
                    if (kwargs && await kwargs.has_symbol(name)) {
                        this.local_set(i, 0, kwargs.get_by_symbol(name)!);
                    } else {
                        throw new ArgumentError(`missing keyword: ${(await Object.send(await Runtime.intern(name), "inspect")).get_data<string>()}`);
                    }
                } else {
                    // optional keyword with expression default value
                    this.local_set(i, 0, kwargs ? kwargs.get_by_symbol(name) || Qnil : Qnil);
                }

                if (kwargs) kwargs.delete_by_symbol(name);
                // Note: local_index is NOT incremented here because keyword parameters
                // are set by index i
            }
        }

        if (iseq.argument_options.keyword_rest_start != null) {
            let kwargs_hash = kwargs || new Hash();

            if (iseq.argument_options.keyword_rest_start === -1) {
                // forwarding parameters (...) - add kwargs to the rest args array
                const lookup = iseq.local_table.find_or_throw("*");

                // avoid mutating original args array
                const old_args = this.local_get(lookup.index, lookup.depth).get_data<RubyArray>().elements;
                this.local_set(lookup.index, lookup.depth, await RubyArray.new([...old_args, await Hash.from_hash(kwargs_hash)]));
            } else if (iseq.argument_options.keyword_rest_start === -2) {
                // anonymous kwrest (i.e. **) - but don't store them anywhere, and no need to set any local variables
            } else {
                // named kwrest (eg. **rest) - store kwargs in local variable
                this.local_set(local_index, 0, kwargs ? await Hash.from_hash(kwargs) : await Hash.new());
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
            // The block_start is the index in the argument list, which corresponds
            // to the index in the local table (since parameters are added to the
            // local table in order before any other local variables)
            const block_index = iseq.argument_options.block_start;
            this.local_set(block_index, 0, block ? block : Qnil);
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
            this.frame?.self || Qnil,
            this.frame?.nesting || [],
            [...this.stack],
            this.stack_len,
            this.frame
        );
    }
}
