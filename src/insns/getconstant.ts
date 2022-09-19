import { NameError } from "../errors";
import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { Module, Qnil, Runtime } from "../runtime";

export default class GetConstant extends Instruction {
    public name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }

    call(context: ExecutionContext) {
        const allow_nil = context.stack.pop();
        let parent = context.stack.pop();

        if (parent == Qnil && !allow_nil?.get_data<boolean>()) {
            throw new NameError(`uninitialized constant ${this.name}`);
        }

        // parent can be Qnil (and nils allowed) if, for example, opt_getinlinecache
        // resulted in a nil being pushed onto the stack (i.e. cache lookup failed)
        if (parent == Qnil) {
            parent = context.stack.pop();
        }

        const parent_data = parent!.get_data<Module | null>();

        const constant = ( () => {
            if (parent_data) {
                return parent_data.constants[this.name];
            } else {
                return Runtime.constants[this.name];
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
