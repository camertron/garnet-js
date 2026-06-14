import { ArgumentError, NameError, NoMethodError, StopIteration } from "../errors";
import { PauseError } from "../execution_context";
import { Frame } from "../frame";
import { ExecutionContext } from "../garnet";
import { Class, InterpretedCallable, NativeCallable, ObjectClass, Qnil, RValue, Runtime, RValuePointer } from "../runtime";
import { Args } from "./arg-scanner";
import { RubyArray } from "./array";
import { Enumerable } from "./enumerable";
import { Hash } from "./hash";
import { Object } from "./object";
import { InterpretedProc, Proc } from "./proc";

type NativeGeneratorType = AsyncGenerator<RValue, void, unknown>;

const normalize_yield_args = async (args: RValue[]): Promise<RValue> => {
    switch (args.length) {
        case 0:
            return Qnil;
        case 1:
            return args[0];
        default:
            return await RubyArray.new(args);
    }
};

type YielderEvent = YielderYieldEvent | YielderTerminalEvent;

type YielderYieldEvent = {
    type: "yield";
    value: RValue;
    resume: (value: RValue) => void;
};

type YielderTerminalEvent = {
    type: "return";
    value: RValue;
} | {
    type: "error";
    error: unknown;
};

class YielderController {
    private ec: ExecutionContext;
    private enumerator: ControllableEnumerator;
    private caller_stack: RValuePointer[] | null = null;
    private caller_frame: Frame | null = null;
    private pending_event: YielderEvent | null = null;
    private terminal_event: YielderTerminalEvent | null = null;
    private waiting: ((event: YielderEvent) => void) | null = null;
    private paused_event: YielderYieldEvent | null = null;

    constructor(ec: ExecutionContext, enumerator: ControllableEnumerator) {
        this.ec = ec;
        this.enumerator = enumerator;
    }

    async next(): Promise<RValue> {
        this.capture_caller();

        await this.enumerator.start();

        if (this.paused_event) {
            const paused_event = this.paused_event;
            this.paused_event = null;
            paused_event.resume(Qnil);
        }

        const event = await this.receive();

        switch (event.type) {
            case "yield":
                this.paused_event = event;
                return event.value;
            case "return":
                throw new StopIteration("iteration reached an end");
            case "error":
                throw event.error;
        }
    }

    yield(value: RValue): Promise<RValue> {
        const suspended_stack = this.ec.stack;
        const suspended_frame = this.ec.frame;

        this.restore_caller();

        return new Promise<RValue>((resolve) => {
            this.deliver({
                type: "yield",
                value,
                resume: (resume_value: RValue) => {
                    this.ec.stack = suspended_stack;
                    this.ec.frame = suspended_frame;
                    resolve(resume_value);
                }
            });
        });
    }

    return(value: RValue) {
        this.restore_caller();
        this.deliver({ type: "return", value });
    }

    error(error: unknown) {
        this.restore_caller();
        this.deliver({ type: "error", error });
    }

    private capture_caller() {
        this.caller_stack = this.ec.stack.map(ptr => new RValuePointer(ptr.rval));
        this.caller_frame = this.ec.frame;
    }

    private restore_caller() {
        if (!this.caller_stack) {
            throw new Error("Attempted to restore enumerator caller before capturing it");
        }

        this.ec.stack = this.caller_stack;
        this.ec.frame = this.caller_frame;
    }

    private receive(): Promise<YielderEvent> {
        if (this.pending_event) {
            const event = this.pending_event;
            this.pending_event = null;
            return Promise.resolve(event);
        }

        if (this.terminal_event) {
            return Promise.resolve(this.terminal_event);
        }

        return new Promise<YielderEvent>((resolve) => {
            this.waiting = resolve;
        });
    }

    private deliver(event: YielderEvent) {
        if (event.type === "return" || event.type === "error") {
            this.terminal_event = event;
        }

        if (this.waiting) {
            const waiting = this.waiting;
            this.waiting = null;
            waiting(event);
        } else {
            this.pending_event = event;
        }
    }
}

export abstract class Enumerator {
    protected static klass_: RValue;

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant("Enumerator");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant Enumerator");
            }
        }

        return this.klass_;
    }

    static async new(enumerator: Enumerator): Promise<RValue> {
        return new RValue(await this.klass(), enumerator);
    }

    static async for_method(receiver: RValue, method_name: string, args: RValue[], kwargs?: Hash): Promise<RValue> {
        return await this.new(new MethodRefEnumerator(receiver, method_name, args, kwargs));
    }

    static async for_native_generator(gen_func: () => NativeGeneratorType): Promise<RValue> {
        return await this.new(new NativeCallableEnumerator(gen_func));
    }

    static async for_proc(proc: InterpretedProc): Promise<RValue> {
        return await this.new(new InterpretedProcEnumerator(ExecutionContext.current, proc));
    }

    abstract next(): Promise<RValue>;
}

class MethodRefEnumerator extends Enumerator {
    private receiver: RValue;
    private method_name: string;
    private args: RValue[];
    private kwargs: Hash | undefined;
    private enumerator: Enumerator;

    constructor(receiver: RValue, method_name: string, args: RValue[], kwargs?: Hash) {
        super();

        this.receiver = receiver;
        this.method_name = method_name;
        this.args = args;
        this.kwargs = kwargs
    }

    async next(): Promise<RValue> {
        if (!this.enumerator) {
            const method = await Object.find_method_under(this.receiver, this.method_name);

            if (!method) {
                const inspect_str = (await Object.send(this.receiver, "inspect")).get_data<string>();
                throw new NoMethodError(`undefined method \`${this.method_name}' for ${inspect_str}`);
            }

            if (method instanceof NativeCallable) {
                const enumerator = await method.call(ExecutionContext.current, this.receiver, this.args, this.kwargs);

                if (enumerator.klass !== await Enumerator.klass()) {
                    throw new TypeError(`Native method \`${this.method_name}' did not return an enumerator`);
                }

                this.enumerator = enumerator.get_data<Enumerator>();
            } else if (method instanceof InterpretedCallable) {
                this.enumerator = new InterpretedCallableEnumerator(ExecutionContext.current, this.receiver, method, this.args, this.kwargs);
            }
        }

        return this.enumerator.next();
    }
}

class NativeCallableEnumerator extends Enumerator {
    private generator_fn: () => NativeGeneratorType;
    private generator: NativeGeneratorType;

    constructor(generator_fn: () => NativeGeneratorType) {
        super();

        this.generator_fn = generator_fn;
    }

    async next(): Promise<RValue> {
        if (!this.generator) {
            this.generator = this.generator_fn() as NativeGeneratorType;
        }

        const result = await this.generator.next();

        if (result.done && result.value === undefined) {
            throw new StopIteration("iteration reached an end");
        }

        return result.value!;
    }
}

interface ControllableEnumerator {
    start(): Promise<void>;  // should start producer only; must not await completion
}

class InterpretedCallableEnumerator extends Enumerator implements ControllableEnumerator {
    private ec: ExecutionContext;
    private receiver: RValue;
    private method: InterpretedCallable;
    private args: RValue[];
    private kwargs: Hash | undefined;
    private controller: YielderController;
    private running: Promise<void> | null;

    constructor(ec: ExecutionContext, receiver: RValue, method: InterpretedCallable, args: RValue[] = [], kwargs?: Hash) {
        super();

        this.ec = ec;
        this.receiver = receiver;
        this.method = method;
        this.args = args;
        this.kwargs = kwargs;
        this.controller = new YielderController(ec, this);
        this.running = null;
    }

    async next(): Promise<RValue> {
        return this.controller.next();
    }

    async start() {
        if (this.running) {
            return;
        }

        const block = await Proc.from_native_fn(this.ec, async (_self: RValue, args: RValue[]): Promise<RValue> => {
            return await this.controller.yield(await normalize_yield_args(args));
        });

        this.running = this.method.call(this.ec, this.receiver, this.args, this.kwargs, block)
            .then((value: RValue) => this.controller.return(value))
            .catch((error: unknown) => this.controller.error(error));
    }
}

class Yielder {
    private static klass_: RValue;
    private controller?: YielderController;
    private block?: RValue;

    constructor(controller?: YielderController, block?: RValue) {
        this.controller = controller;
        this.block = block;
    }

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await (await Enumerator.klass()).get_data<Class>().find_constant("Yielder");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant Enumerator::Yielder");
            }
        }

        return this.klass_;
    }

    static async new_for_controller(controller: YielderController): Promise<RValue> {
        return new RValue(await this.klass(), new Yielder(controller));
    }

    static async new(block: RValue): Promise<RValue> {
        return new RValue(await this.klass(), new Yielder(undefined, block));
    }

    async yield(args: RValue[]): Promise<RValue> {
        const value = await normalize_yield_args(args);

        if (this.controller) {
            return await this.controller.yield(value);
        }

        if (this.block) {
            return await this.block.get_data<Proc>().call(ExecutionContext.current, args);
        }

        throw new TypeError("uninitialized yielder");
    }
}

class InterpretedProcEnumerator extends Enumerator implements ControllableEnumerator {
    private ec: ExecutionContext;
    private proc: InterpretedProc;
    private yielder_: RValue;
    private controller: YielderController;
    private running: Promise<void> | null;

    constructor(ec: ExecutionContext, proc: InterpretedProc) {
        super();

        this.ec = ec;
        this.proc = proc;
        this.controller = new YielderController(ec, this);
        this.running = null;
    }

    async next(): Promise<RValue> {
        return this.controller.next();
    }

    async start() {
        if (this.running) {
            return;
        }

        this.running = this.proc.call(this.ec, [await this.yielder()])
            .then((value: RValue) => this.controller.return(value))
            .catch((error: unknown) => this.controller.error(error));
    }

    private async yielder(): Promise<RValue> {
        if (!this.yielder_) {
            this.yielder_ = await Yielder.new_for_controller(this.controller);
        }

        return this.yielder_;
    }
}

export class Lazy {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        if (!this.klass_) {
            const klass = await Object.find_constant_under(await Enumerator.klass(), "Lazy");

            if (klass) {
                this.klass_ = klass;
            } else {
                throw new NameError("missing constant Enumerator::Lazy");
            }
        }

        return this.klass_;
    }

    static async new(enumerable: RValue): Promise<RValue> {
        return new RValue(await this.klass(), (await Object.send(enumerable, "each")).get_data<Enumerator>());
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Enumerator", ObjectClass, async (klass: Class) => {
        klass.include(await Enumerable.module());

        klass.define_native_singleton_method("new", async (self: RValue, _args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (!block) {
                throw new ArgumentError("tried to create Proc object without a block");
            }

            // We're making an assumption here that we've received an InterpretedProc. It's hopefully
            // exceptionally rare that a native block would be passed to Enumerator.new.
            return await Enumerator.for_proc(block.get_data<InterpretedProc>());
        });

        klass.define_native_method("next", async (self: RValue): Promise<RValue> => {
            return await self.get_data<Enumerator>().next();
        });

        klass.define_native_method("each", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (!block) {
                return self;
            }

            const enumerator = self.get_data<Enumerator>();
            const proc = block.get_data<Proc>();

            while (true) {
                try {
                    await proc.call(ExecutionContext.current, [await enumerator.next()])
                } catch (e) {
                    if (e instanceof StopIteration) {
                        break;
                    }

                    throw e;
                }
            }

            return self;
        });
    });

    const check_block_given = (block: RValue | undefined, method_name: string) => {
        if (!block) {
            throw new ArgumentError(`tried to call lazy ${method_name} without a block`);
        }
    }

    await Runtime.define_class_under(await Enumerator.klass(), "Lazy", await Enumerator.klass(), (klass: Class) => {
        klass.define_native_method("select", async (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): Promise<RValue> => {
            check_block_given(block, "select");
            const proc = block!.get_data<Proc>();
            const parent_enum = self.get_data<Enumerator>();

            return Lazy.new(
                await Enumerator.for_native_generator(async function* () {
                    while (true) {
                        const next_val = await parent_enum.next();

                        if ((await proc.call(ExecutionContext.current, [next_val])).is_truthy()) {
                            yield next_val;
                        }
                    }
                })
            );
        });
    });

    await Runtime.define_class_under(await Enumerator.klass(), "Yielder", ObjectClass, async (klass: Class) => {
        klass.define_native_method("initialize", async (self: RValue, args: RValue[], kwargs?: Hash, block?: RValue): Promise<RValue> => {
            if (!block) {
                throw new ArgumentError("tried to create Enumerator::Yielder object without a block");
            }

            self.data = new Yielder(undefined, block);
            return self;
        });

        klass.define_native_method("yield", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await self.get_data<Yielder>().yield(args);
        });

        klass.define_native_method("<<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [value] = await Args.scan("1", args);
            return await self.get_data<Yielder>().yield([value]);
        });

        klass.define_native_method("to_proc", async (self: RValue): Promise<RValue> => {
            return await Proc.from_native_fn(ExecutionContext.current, async (_self: RValue, args: RValue[]): Promise<RValue> => {
                return await self.get_data<Yielder>().yield(args);
            });
        });
    });

    inited = true;
};
