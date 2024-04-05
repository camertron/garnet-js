import { ThreadError } from "../errors";
import { BreakError, ExecutionContext } from "../execution_context";
import { Class, ObjectClass, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime";
import { String } from "../runtime/string";
import { Proc } from "../runtime/proc";
import { Object } from "../runtime/object";
import { Integer } from "../runtime/integer";
import { Hash } from "../runtime/hash";

let inited = false;

export class Thread {
    private static thread_class_: RValue;
    private static current_: RValue;

    static new(): RValue {
        return new RValue(this.thread_class, new Thread());
    }

    private static get thread_class(): RValue {
        if (!this.thread_class_) {
            this.thread_class_ = Object.find_constant("Thread")!;
        }

        return this.thread_class_;
    }

    static get current(): RValue {
        if (!this.current_) {
            this.current_ = Thread.new();
        }

        return this.current_;
    }
}

export class Mutex {
    private static mutex_class_: RValue;

    static new(): RValue {
        return new RValue(this.mutex_class, new Mutex());
    }

    private static get mutex_class(): RValue {
        if (!this.mutex_class_) {
            this.mutex_class_ = Object.find_constant("Thread")!.get_data<Class>().find_constant("Mutex")!;
        }

        return this.mutex_class_;
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

export class BacktraceLocation {
    private static location_class_: RValue;

    static new(path: string, lineno: number, label: string): RValue {
        return new RValue(this.location_class, new BacktraceLocation(path, lineno, label));
    }

    private static get location_class(): RValue {
        if (!this.location_class_) {
            this.location_class_ = Object
                .find_constant("Thread")!.get_data<Class>()
                .find_constant("Backtrace")!.get_data<Class>()
                .find_constant("Location")!;
        }

        return this.location_class_;
    }

    public path: string;
    private path_rval_: RValue;
    public lineno: number;
    private lineno_rval_: RValue;
    public label: string;
    private label_rval_: RValue;

    constructor(path: string, lineno: number, label: string) {
        this.path = path;
        this.lineno = lineno;
        this.label = label;
    }

    get path_rval(): RValue {
        if (!this.path_rval_) {
            this.path_rval_ = String.new(this.path);
        }

        return this.path_rval_;
    }

    get lineno_rval(): RValue {
        if (!this.lineno_rval_) {
            this.lineno_rval_ = Integer.get(this.lineno);
        }

        return this.lineno_rval_;
    }

    get label_rval(): RValue {
        if (!this.label_rval_) {
            this.label_rval_ = String.new(this.label);
        }

        return this.label_rval_;
    }
}

export const init = () => {
    if (inited) return;

    // Jesus I hope I don't have to implement this whole thing any time soon 😱
    const ThreadClass = Runtime.define_class("Thread", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("current", (_self: RValue): RValue => {
            return Thread.current;
        });

        klass.define_native_method("join", (_self: RValue, _args: RValue[]) => {
            // do nothing because we don't acually support threads
            return Qnil;
        })
    });

    const MutexClass = Runtime.define_class_under(ThreadClass, "Mutex", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("new", (self: RValue): RValue => {
            return Mutex.new();
        });

        klass.define_native_method("synchronize", (self: RValue, _args: RValue[], _kwargs?: Hash, block?: RValue): RValue => {
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

    const BacktraceClass = Runtime.define_class_under(ThreadClass, "Backtrace", ObjectClass, (klass: Class) => {
        // klass.define_native_method("to_s", (self: RValue): RValue => {
        //     return Qnil;
        // });

        // klass.define_native_method("inspect", (self: RValue): RValue => {
        //     return Qnil;
        // });
    });

    Runtime.define_class_under(BacktraceClass, "Location", ObjectClass, (klass: Class) => {
        klass.define_native_method("path", (self: RValue): RValue => {
            return self.get_data<BacktraceLocation>().path_rval;
        });

        klass.define_native_method("lineno", (self: RValue): RValue => {
            return self.get_data<BacktraceLocation>().lineno_rval;
        });

        klass.define_native_method("label", (self: RValue): RValue => {
            return self.get_data<BacktraceLocation>().label_rval;
        });

        klass.define_native_method("inspect", (self: RValue): RValue => {
            const loc = self.get_data<BacktraceLocation>();
            return String.new(`${loc.path}:${loc.lineno} in ${loc.label}`);
        });
    });

    inited = true;
};
