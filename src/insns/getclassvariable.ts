import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass, Qnil } from "../runtime";
import { ClassFrame, IFrameWithOwner } from "../frame";

export default class GetClassVariable extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        let klass = context.frame!.self;
        if (klass.klass !== ClassClass) klass = klass.klass;

        // class variables are lexically scoped, so look them up from the owner of the method
        const frame = context.frame as IFrameWithOwner;

        if (frame.owner) {
            let target = frame.owner.rval;

            // if the owner is a singleton class, look up from the attached object
            if (target.klass === ClassClass && target.get_data<Class>().is_singleton_class && target.get_data<Class>().attached_object) {
                target = target.get_data<Class>().attached_object!;
            }

            const value = await target.cvar_get(this.name);
            context.push(value);

            return null;
        }

        // if we're in a ClassFrame (module/class body), use self directly,
        // but if self is a singleton class, look up from the attached object
        if (context.frame instanceof ClassFrame) {
            let target = context.frame.self;

            if (target.klass === ClassClass && target.get_data<Class>().is_singleton_class && target.get_data<Class>().attached_object) {
                target = target.get_data<Class>().attached_object!;
            }

            const value = await target.cvar_get(this.name);
            context.push(value);

            return null;
        }

        // for singleton classes, class variables are looked up from the singleton class first
        // (to check extended modules), then from the attached object
        let value = await klass.cvar_get(this.name);

        if (value === Qnil && klass.get_data<Class>().is_singleton_class && klass.get_data<Class>().attached_object) {
            value = await klass.get_data<Class>().attached_object!.cvar_get(this.name);
        }

        context.push(value);
        return null;
    }

    length(): number {
        return 3;
    }

    pops(): number {
        return 1;
    }
}
