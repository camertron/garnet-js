import { LexicalScope } from "../compiler";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Module } from "../runtime";
import { ParameterMetadata } from "../runtime/parameter-meta";

export default class DefineSMethod extends Instruction {
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
        const mod = context.pop()!;

        context.define_method(
            mod.get_singleton_class(),
            this.name,
            this.iseq,
            this.parameters_meta,
            this.lexical_scope
        );

        return null;
    }

    length(): number {
        return 3;
    }
}
