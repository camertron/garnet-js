import { NameError } from "../errors";
import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass, Module, Qnil } from "../runtime";

export default class GetConstant extends Instruction {
    public name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }

    // From insns.def (slightly modified):
    //
    // "Get constant variable <name>. If klass (second stack value) is Qnil
    // and allow_nil (first stack value) is Qtrue, constants are searched in
    // the current scope. Otherwise, get constant under klass class or module."
    call(context: ExecutionContext) {
        const allow_nil = context.stack.pop()!.get_data<boolean>();
        let parent = context.stack.pop();

        if (parent == Qnil && !allow_nil) {
            throw new NameError(`uninitialized constant ${this.name}`);
        }

        const constant = ( () => {
            // a parent of Qnil (and nils allowed) means look up the constant in the
            // current scope, i.e. selfo
            if (parent == Qnil) {
                if (context.current_frame().selfo.klass === ClassClass.get_data<Class>()) {
                    return context.current_frame().selfo.get_data<Class>().find_constant(this.name);
                } else {
                    return context.current_frame().selfo.klass.find_constant(this.name);
                }
            } else {
                return parent!.get_data<Module>().find_constant(this.name);
            }
        })();

        if (!constant) {
            throw new NameError(`uninitialized constant ${this.name}`);
        }

        context.stack.push(constant);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 0;
    }
}
