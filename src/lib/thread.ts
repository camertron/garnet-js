import { ThreadError } from "../errors";
import { BreakError, ExecutionContext } from "../execution_context";
import { Class, Kwargs, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { Proc } from "../runtime/proc";
import { Object } from "../runtime/object";

let inited = false;

export class Mutex {
    static new(): RValue {
        return new RValue(Object.find_constant("Thread")!.get_data<Class>().find_constant("Mutex")!, new Mutex());
    }

    public locked: boolean;

    constructor() {
        this.locked = false;
    }

    lock() {
        // @TODO: raise if locked by the current thread; otherwise, wait until unlocked

        if (this.locked) {
            throw new ThreadError("deadlock; recursive locking");
        }

        this.locked = true;
    }

    unlock() {
        // @TODO: throw if not locked by the current thread

        if (this.locked) {
            this.locked = false;
        } else {
            throw new ThreadError("Attempt to unlock a mutex which is not locked");
        }
    }
}

export const init = () => {
    if (inited) return;

    // Jesus I hope I don't have to implement this whole thing any time soon 😱
    const ThreadClass = Runtime.define_class("Thread", ObjectClass);

    const MutexClass = Runtime.define_class_under(ThreadClass, "Mutex", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("new", (self: RValue): RValue => {
            return Mutex.new();
        });

        klass.define_native_method("synchronize", (self: RValue, _args: RValue[], _kwargs?: Kwargs, block?: RValue): RValue => {
            if (!block) {
                throw new ThreadError("must be called with a block");
            }

            const mutex = self.get_data<Mutex>();
            let return_value = Qnil;

            try {
                mutex.lock();
                return_value = block.get_data<Proc>().call(ExecutionContext.current, []);
            } catch (e) {
                if (e instanceof BreakError) {
                    mutex.unlock();
                    return e.value;
                }

                mutex.unlock();
                throw e;
            }

            mutex.unlock();
            return return_value;
        });

        klass.define_native_method("locked?", (self: RValue): RValue => {
            return self.get_data<Mutex>().locked ? Qtrue : Qfalse;
        });

        klass.define_native_method("owned?", (self: RValue): RValue => {
            // @TODO: take thread ownership into account; fine for now since Garnet doesn't support threads
            return Qtrue;
        });

        klass.define_native_method("lock", (self: RValue): RValue => {
            self.get_data<Mutex>().lock();
            return self;
        });

        klass.define_native_method("try_lock", (self: RValue): RValue => {
            const mutex = self.get_data<Mutex>();

            // @TODO: this logic will need to take thread ownership into account if/when I ever
            // implement threading (pray for me)
            if (mutex.locked) {
                return Qfalse;
            } else {
                mutex.lock();
                return Qtrue;
            }
        });

        klass.define_native_method("unlock", (self: RValue): RValue => {
            self.get_data<Mutex>().unlock();
            return self;
        });
    });

    // alias
    ObjectClass.get_data<Class>().constants["Mutex"] = MutexClass;

    inited = true;
};
