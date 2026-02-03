import { ArgumentError, NameError, NoMethodError, StopIteration } from "../errors";
import { PauseError } from "../execution_context";
import { BlockFrame, Frame } from "../frame";
import { ExecutionContext } from "../garnet";
import { Class, InterpretedCallable, NativeCallable, ObjectClass, Qnil, RValue, Runtime } from "../runtime";
import { Binding } from "./binding";
import { Enumerable } from "./enumerable";
import { Hash } from "./hash";
import { Object } from "./object";
import { InterpretedProc, Proc } from "./proc";

type NativeGeneratorType = AsyncGenerator<RValue, void, unknown>;

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
                this.enumerator = new InterpretedCallableEnumerator(ExecutionContext.current, this.receiver, method);
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

class InterpretedCallableEnumerator extends Enumerator {
    private ec: ExecutionContext;
    private receiver: RValue;
    private method: InterpretedCallable;
    private current: RValue;
    private frame: Frame | null;
    private binding: Binding | null;

    constructor(ec: ExecutionContext, receiver: RValue, method: InterpretedCallable) {
        super();

        this.ec = ec;
        this.receiver = receiver;
        this.method = method;
        this.current = Qnil;
        this.frame = null;
        this.binding = null;
    }

    async next(): Promise<RValue> {
        try {
            // If we have a reference to a frame, then that means the method yielded and was paused.
            if (this.frame && this.binding) {
                // Restore the stack to what it was when the frame was paused, then execute the
                // frame. The block below should still be available at its position on the
                // restored stack, meaning any additional yields will call the block.
                await this.ec.with_stack(this.binding.stack, async (): Promise<RValue> => {
                    return await this.ec.execute_frame(this.frame!, this.ec.frame);
                });
            } else {
                // This block receives each yielded value. When the frame is resumed, this block
                // is still available because locals are preserved via the binding.
                await this.method.call(this.ec, this.receiver, [], undefined, await Proc.from_native_fn(this.ec, (_self: RValue, args: RValue[]): RValue => {
                    this.current = args[0];

                    // Only create a binding the first time a value is yielded.
                    if (!this.frame) {
                        this.frame = this.ec.frame;
                        this.binding = this.ec.get_binding();
                    }

                    // Instruct the execution context to effectively "pause" the current frame
                    // by restoring the previous frame and continuing to execute it as if the
                    // block returned.
                    throw new PauseError(this.current);
                }));
            }
        } catch (e) {
            if (e instanceof PauseError) {
                return e.value;
            }

            throw e;
        }

        throw new StopIteration("iteration reached an end");
    }
}

class Yielder {
    private static klass_: RValue;

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

    static async new(): Promise<RValue> {
        return new RValue(await this.klass(), new Yielder());
    }

    yield(value: RValue) {
        throw new PauseError(value);
    }
}

/* NOTE: enumerators do not work properly if Yielder#<< is called inside a native proc, eg:
 *
 * Enumerator.new do |yielder|
 *   loop do
 *     yielder << :foo
 *   end
 * end
 *
 * Supporting the ability to yield in the middle of arbitrary blocks works for interpreted
 * code but not native code because Garnet can control when native code executes. In this
 * example, Kernel#loop is a native method that is not capable of stopping and resuming as
 * enumerators are required to do. We could implement Kernel#loop in Ruby, but Yielder#<<
 * can be called from the body of _any_ block. Therefore, some work will have to be done to
 * support pausing native blocks - perhaps blocks could always be JavaScript generators?
 * I'm not sure how ergonomic that would be.
*/
class InterpretedProcEnumerator extends Enumerator {
    private ec: ExecutionContext;
    private proc: InterpretedProc;
    private frame: BlockFrame;
    private yielder_: RValue;

    constructor(ec: ExecutionContext, proc: InterpretedProc) {
        super();

        this.ec = ec;
        this.proc = proc;
    }

    async next(): Promise<RValue> {
        try {
            if (this.frame) {
                await this.ec.with_stack(this.proc.binding.stack, async (): Promise<RValue> => {
                    return await this.ec.execute_frame(this.frame!, this.ec.frame);
                })
            } else {
                await this.proc.call(this.ec, [await this.yielder()], undefined, undefined, undefined, undefined, (frame: BlockFrame) => {
                    this.frame = frame;
                });
            }
        } catch (e) {
            if (e instanceof PauseError) {
                return e.value;
            }

            throw e;
        }

        throw new StopIteration("iteration reached an end");
    }

    private async yielder(): Promise<RValue> {
        if (!this.yielder_) {
            this.yielder_ = await Yielder.new();
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

    Runtime.define_class_under(await Enumerator.klass(), "Lazy", await Enumerator.klass(), (klass: Class) => {
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
        klass.define_native_method("yield", (self: RValue, args: RValue[]): RValue => {
            self.get_data<Yielder>().yield(args[0]);
            return Qnil;
        });

        await klass.alias_method("<<", "yield");
    });

    inited = true;
};
