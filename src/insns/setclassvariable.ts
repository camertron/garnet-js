import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass } from "../runtime";
import { ClassFrame, IFrameWithOwner } from "../frame";

export default class SetClassVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        let klass = context.frame!.self;
        if (klass.klass !== ClassClass) klass = klass.klass;

        const value = context.pop()!;

        // class variables are lexically scoped, so look them up from the owner of the method
        const frame = context.frame as IFrameWithOwner;

        if (frame.owner) {
            let target = frame.owner.rval;

            // if the owner is a singleton class, set on the attached object
            if (target.klass === ClassClass && target.get_data<Class>().is_singleton_class && target.get_data<Class>().attached_object) {
                target = target.get_data<Class>().attached_object!;
            }

            await target.cvar_set(this.name, value);

            return null;
        }

        // if we're in a ClassFrame (module/class body), use self directly,
        // but if self is a singleton class, set on the attached object
        if (context.frame instanceof ClassFrame) {
            let target = context.frame.self;

            if (target.klass === ClassClass && target.get_data<Class>().is_singleton_class && target.get_data<Class>().attached_object) {
                target = target.get_data<Class>().attached_object!;
            }

            await target.cvar_set(this.name, value);

            return null;
        }

        // for singleton classes, check if the class variable exists in the singleton class
        // (e.g., in extended modules) or in the attached object
        if (klass.get_data<Class>().is_singleton_class && klass.get_data<Class>().attached_object) {
            const exists_in_singleton = await klass.cvar_exists(this.name);
            const exists_in_attached = await klass.get_data<Class>().attached_object!.cvar_exists(this.name);

            if (exists_in_attached && !exists_in_singleton) {
                await klass.get_data<Class>().attached_object!.cvar_set(this.name, value);
            } else {
                // set on the singleton class (will search ancestors including extended modules)
                await klass.cvar_set(this.name, value);
            }
        } else {
            await klass.cvar_set(this.name, value);
        }

        return null;
    }

    length(): number {
        return 3;
    }

    pops(): number {
        return 1;
    }
}
