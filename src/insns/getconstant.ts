import { NameError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass, Module, ModuleClass, Qnil, Qtrue } from "../runtime";

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
    call(context: ExecutionContext): ExecutionResult {
        const allow_nil = context.pop()!.get_data<boolean>();
        let parent = context.pop();

        if (parent == Qnil && !allow_nil) {
            throw new NameError(`uninitialized constant ${this.name}`);
        }

        const constant = ( () => {
            // a parent of Qnil (and nils allowed) means look up the constant in the
            // current scope, i.e. self
            if (parent == Qnil) {
                if (context.frame!.self.klass === ClassClass || context.frame!.self.klass === ModuleClass) {
                    return context.frame!.self.get_data<Class>().find_constant(this.name);
                } else {
                    return context.frame!.self.klass.get_data<Class>().find_constant(this.name);
                }
            } else {
                return parent!.get_data<Module>().find_constant(this.name);
            }
        })();

        if (!constant) {
            throw new NameError(`uninitialized constant ${this.name}`);
        }

        context.push(constant);
        return null;
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}
