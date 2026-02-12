import { LexicalScope } from "../compiler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { ParameterMetadata } from "../runtime/parameter-meta";
import { Object } from "../runtime/object"
import { Runtime, ClassClass, ModuleClass } from "../garnet";

export default class DefineMethod extends Instruction {
    public name: string;
    public iseq: InstructionSequence;
    public parameters_meta: ParameterMetadata[];
    public lexical_scope: LexicalScope;

    constructor(name: string, iseq: InstructionSequence, parameters_meta: ParameterMetadata[], lexical_scope: LexicalScope) {
        super();
        this.name = name;
        this.iseq = iseq;
        this.parameters_meta = parameters_meta;
        this.lexical_scope = lexical_scope;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const target = context.frame!.self;

        context.define_method(
            target,
            this.name,
            this.iseq,
            this.parameters_meta,
            this.lexical_scope
        );

        // call on the target's class where appropriate (ie. for methods on instance singleton classes)
        const method_added_target = (target.klass === ClassClass || target.klass === ModuleClass)
            ? target
            : target.klass;

        await Object.send(method_added_target, "method_added", [await Runtime.intern(this.name)]);

        return null;
    }

    length(): number {
        return 3;
    }
}
