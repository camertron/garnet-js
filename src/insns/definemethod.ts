import { LexicalScope } from "../compiler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { ParameterMetadata } from "../runtime/parameter-meta";
import { Object } from "../runtime/object"
import { Runtime } from "../garnet";

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
        context.define_method(
            context.frame!.self,
            this.name,
            this.iseq,
            this.parameters_meta,
            this.lexical_scope
        );

        await Object.send(context.frame!.self.klass, "method_added", [await Runtime.intern(this.name)]);

        return null;
    }

    length(): number {
        return 3;
    }
}
