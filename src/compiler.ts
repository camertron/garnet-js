import { ParseResult } from "@ruby/prism/src/deserialize";
import { MethodCallData, BlockCallData, CallDataFlag, CallData } from "./call_data";
import { CatchBreak, InstructionSequence, Label, CatchTableStack, CatchNext } from "./instruction_sequence";
import { CompilerOptions } from "./compiler_options";
import {
    AliasGlobalVariableNode,
    AliasMethodNode,
    AndNode,
    ArgumentsNode,
    ArrayNode,
    AssocNode,
    AssocSplatNode,
    BackReferenceReadNode,
    BeginNode,
    BlockArgumentNode,
    BlockNode,
    BlockParameterNode,
    BlockParametersNode,
    BreakNode,
    CallNode,
    CallOperatorWriteNode,
    CallTargetNode,
    CaseNode,
    ClassNode,
    ClassVariableOrWriteNode,
    ClassVariableReadNode,
    ClassVariableTargetNode,
    ClassVariableWriteNode,
    ConstantPathNode,
    ConstantPathTargetNode,
    ConstantPathWriteNode,
    ConstantReadNode,
    ConstantTargetNode,
    ConstantWriteNode,
    DefNode,
    DefinedNode,
    ElseNode,
    EmbeddedStatementsNode,
    EmbeddedVariableNode,
    EnsureNode,
    FalseNode,
    FloatNode,
    ForwardingArgumentsNode,
    ForwardingParameterNode,
    ForwardingSuperNode,
    GlobalVariableOrWriteNode,
    GlobalVariableReadNode,
    GlobalVariableTargetNode,
    GlobalVariableWriteNode,
    HashNode,
    IfNode,
    ImplicitNode,
    ImplicitRestNode,
    IndexOperatorWriteNode,
    IndexOrWriteNode,
    IndexTargetNode,
    InstanceVariableOperatorWriteNode,
    InstanceVariableOrWriteNode,
    InstanceVariableReadNode,
    InstanceVariableTargetNode,
    InstanceVariableWriteNode,
    IntegerNode,
    InterpolatedRegularExpressionNode,
    InterpolatedStringNode,
    InterpolatedSymbolNode,
    InterpolatedXStringNode,
    KeywordHashNode,
    KeywordRestParameterNode,
    LambdaNode,
    LocalVariableAndWriteNode,
    LocalVariableOperatorWriteNode,
    LocalVariableOrWriteNode,
    LocalVariableReadNode,
    LocalVariableTargetNode,
    LocalVariableWriteNode,
    Location,
    MissingNode,
    ModuleNode,
    MultiTargetNode,
    MultiWriteNode,
    NextNode,
    NilNode,
    NoKeywordsParameterNode,
    Node,
    NumberedParametersNode,
    NumberedReferenceReadNode,
    OptionalKeywordParameterNode,
    OptionalParameterNode,
    OrNode,
    ParametersNode,
    ParenthesesNode,
    PreExecutionNode,
    ProgramNode,
    RangeNode,
    RegularExpressionNode,
    RequiredKeywordParameterNode,
    RequiredParameterNode,
    RescueModifierNode,
    RescueNode,
    RestParameterNode,
    RetryNode,
    ReturnNode,
    SelfNode,
    SingletonClassNode,
    SourceFileNode,
    SourceLineNode,
    SplatNode,
    StatementsNode,
    StringNode,
    SuperNode,
    SymbolNode,
    TrueNode,
    UnlessNode,
    UntilNode,
    WhenNode,
    WhileNode,
    XStringNode,
    YieldNode
} from "@ruby/prism/src/nodes";
import { Visitor } from "@ruby/prism/src/visitor";
import { Lookup } from "./local_table";
import { Module, ObjectClass, Qnil, Qtrue, RValue } from "./runtime";
import { DefineClassFlags } from "./insns/defineclass";
import { Regexp } from "./runtime/regexp";
import { DefinedType } from "./insns/defined";
import { GetSpecialType } from "./insns/getspecial";
import { SyntaxError } from "./errors";
import { ParameterMetadata, ParametersMetadataBuilder } from "./runtime/parameter-meta";
import { Encoding } from "./runtime/encoding";
import { ThrowType } from "./execution_context";
import { CheckMatchType } from "./insns/checkmatch";
import { MultiTargetState, MultiTargetStateNode } from "./insns/compiler/multi_targets";
import TopN from "./insns/topn";
import { InsnNode, InstructionList } from "./instruction_list";
import { ExpandArrayFlag } from "./insns/expandarray";
import { SpecialObjectType } from "./insns/putspecialobject";

export type ParseLocal = {
    name: string
}

export type ParseOptions = {
    filepath?: string,
    line?: number,
    encoding?: string,
    frozen_string_literal?: boolean,
    verbose?: boolean,
    version?: string,
    scopes?: ParseLocal[][],
}

export class LexicalScope {
    private file: string;
    private location: SourceLocation | null;
    private parent?: LexicalScope;
    public id: number;

    private static id: number;

    static next_id(): number {
        if (this.id === undefined) {
            this.id = 0;
        } else {
            this.id ++;
        }

        return this.id;
    }

    constructor(file: string, location: SourceLocation | null, parent?: LexicalScope) {
        this.file = file;
        this.location = location;
        this.parent = parent;
        this.id = LexicalScope.next_id();
    }
}

class LexicalScopeStack {
    private stack: LexicalScope[] = [];

    constructor() {
        this.stack = [];
    }

    push(scope: LexicalScope): LexicalScope {
        this.stack.push(scope);
        return scope;
    }

    pop(): LexicalScope | undefined {
        return this.stack.pop();
    }

    empty(): boolean {
        return this.stack.length === 0;
    }

    current(): LexicalScope {
        return this.stack[this.stack.length - 1];
    }
}

type NodeWithBlock = CallNode | SuperNode;

export type SourceLocation = {
    start_line: number
    start_column: number
    end_line: number
    end_column: number
}

export class Compiler extends Visitor {
    private compiler_options: CompilerOptions;
    private source: string;
    private path: string;
    private absolute_path: string;
    private iseq: InstructionSequence;
    private line_offsets_: number[];
    private local_depth: number;
    private local_catch_table_stack: CatchTableStack;
    private current_line: number;
    private line_offset: number;  // offset to add to all line numbers, used by class_eval and friends
    private used_stack: boolean[];
    private lexical_scope_stack: LexicalScopeStack;

    public static parse: (code: string) => ParseResult;

    constructor(source: string, path: string, absolute_path: string, line: number, compiler_options?: CompilerOptions) {
        super();

        this.source = source;
        this.path = path;
        this.absolute_path = absolute_path;
        this.compiler_options = compiler_options || new CompilerOptions();
        this.local_depth = 0;
        this.local_catch_table_stack = new CatchTableStack();
        this.line_offset = line;
        this.current_line = 0;
        this.used_stack = [];
        this.lexical_scope_stack = new LexicalScopeStack();
    }

    static compile(source: string, require_path: string, absolute_path: string, ast: ParseResult, line_offset: number = 0, compiler_options?: CompilerOptions): InstructionSequence {
        if (ast.errors.length > 0) {
            const first_syntax_error = ast.errors.find(err => err.level === "syntax");

            if (first_syntax_error) {
                throw new SyntaxError(first_syntax_error.message);
            }
        }

        const compiler = new Compiler(source, require_path, absolute_path, line_offset, compiler_options);

        return compiler.with_used<InstructionSequence>(true, () => {
            return compiler.visitProgramNode(ast.value);
        })
    }

    static compile_string(source: string, require_path: string, absolute_path: string, line_offset: number = 0, compiler_options?: CompilerOptions): InstructionSequence {
        const ast = Compiler.parse(source);
        return this.compile(source, require_path, absolute_path, ast, line_offset, compiler_options);
    }

    visit(node: Node) {
        this.emit_line_for(node);

        if (Object.getOwnPropertyNames(Compiler.prototype).indexOf(`visit${node.constructor.name}`) === -1) {
            throw new Error(`I don't know how to handle ${node.constructor.name} nodes yet, please help me!`);
        }

        super.visit(node);
    }

    private emit_line_for(node: Node) {
        let line = this.location_to_source_location(node.location)?.start_line;

        if (line && line != this.current_line) {
            this.iseq.push(line + this.line_offset);
            this.current_line = line;
        }
    }

    // The current instruction sequence that we're compiling is always stored
    // on the compiler. When we descend into a node that has its own
    // instruction sequence, this method can be called to temporarily set the
    // new value of the instruction sequence, yield, and then set it back.
    private with_child_iseq(child_iseq: InstructionSequence, cb: () => void) {
        const parent_iseq = this.iseq;

        try {
            this.iseq = child_iseq;
            cb();
            return child_iseq;
        } finally {
            this.iseq = parent_iseq;
        }
    }

    override visitProgramNode(node: ProgramNode): InstructionSequence {
        const location = this.location_to_source_location(node.location);

        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(this.path, location)
        );

        const top_iseq = new InstructionSequence(
            "<main>",
            this.path,
            this.absolute_path,
            location,
            "top",
            lexical_scope,
            null,
            this.compiler_options,
        );

        node.locals.forEach((local: string) => {
            top_iseq.local_table.plain(local);
        });

        this.with_child_iseq(top_iseq, () => {
            this.emit_line_for(node);

            if (node.statements == null) {
                this.iseq.putnil()
            } else {
                const statements = [...node.statements.body];

                // We need to do some preprocessing here to grab up all of the BEGIN{}
                // nodes. We could do this instead by manipulating our linked list of
                // instructions, but it's easier to just do it here.
                const preexes: PreExecutionNode[] = [];
                let index = 0;

                while (index < statements.length) {
                    const statement = statements[index];

                    if (statement instanceof PreExecutionNode) {
                        preexes.push(statement);
                        statements.splice(index, 1);
                    } else {
                        index ++;
                    }
                }

                this.with_used(false, () => this.visitAll(preexes));

                if (statements.length == 0) {
                    this.iseq.putnil();
                } else {
                    const [first_statements, last_statement] = this.split_rest_last(statements)

                    this.with_used(false, () => this.visitAll(first_statements));
                    this.with_used(true, () => this.visit(last_statement));
                }
            }

            this.iseq.leave();
        });

        top_iseq.compile();
        return top_iseq;
    }

    override visitPreExecutionNode(node: PreExecutionNode): void {
        if (node.statements) {
            this.visit(node.statements);
        } else {
            if (this.used) this.iseq.putnil();
        }
    }

    override visitMissingNode(_node: MissingNode): void {
        // no-op: syntax errors are handled in the compile() method, so this is
        // only here just in case
    }

    private split_rest_last<T>(elements: T[]): [T[], T] {
        const last = elements[elements.length - 1];

        if (elements.length <= 1) {
            return [[], last];
        } else {
            return [
                elements.slice(0, elements.length - 1),
                last
            ]
        }
    }

    override visitStatementsNode(node: StatementsNode) {
        const [statements, last_statement] = this.split_rest_last(node.body as any[])

        this.with_used(false, () => this.visitAll(statements));
        this.visit(last_statement);
    }

    override visitArgumentsNode(node: ArgumentsNode) {
        if (node.arguments_) {
            this.visitAll(node.arguments_)
        }
    }

    private populate_call_data_args(node: ArgumentsNode, call_data: CallData) {
        const kw_arg = [];
        let found_splat = false;
        let found_kwsplat = false;

        if (node.arguments_) {
            for (const argument of node.arguments_) {
                this.with_used(true, () => this.visit(argument));

                if (argument instanceof SplatNode) {
                    call_data.flag |= CallDataFlag.ARGS_SPLAT;
                    if (!found_splat) call_data.argc ++;
                    this.iseq.splatarray(!found_splat);
                    if (found_splat) this.iseq.concatarray();
                    found_splat = true;
                } else if (argument instanceof ForwardingArgumentsNode) {
                    call_data.argc ++;
                    call_data.flag |= CallDataFlag.ARGS_SPLAT;
                    call_data.flag |= CallDataFlag.KW_SPLAT_FWD;
                    call_data.flag |= CallDataFlag.ARGS_BLOCKARG;
                } else if (argument instanceof KeywordHashNode) {
                    // stop coalescing positional args
                    found_splat = false;

                    for (const element of argument.elements) {
                        if (element instanceof AssocNode) {
                            call_data.flag |= CallDataFlag.KWARG;
                            const assoc_node = element as AssocNode;

                            // Any kwargs that are not keyed by symbols must be optional and are
                            // slurped up into the kwsplat hash.
                            if (assoc_node.key instanceof SymbolNode && !found_kwsplat) {
                                kw_arg.push(assoc_node.key.unescaped.value);
                            } else {
                                // If even one of the keys isn't a symbol, _all_ the kwargs are
                                // passed in the kwsplat hash.
                                found_kwsplat = true;
                                kw_arg.length = 0;
                            }
                        } else if (element instanceof AssocSplatNode) {
                            found_kwsplat = true;
                        }
                    }
                } else {
                    if (found_splat) {
                        this.iseq.newarray(1);
                        this.iseq.concatarray();
                    } else {
                        call_data.argc ++;
                    }
                }
            }
        }

        // If there is any kwsplat, set the KW_SPLAT flag but _not_ the KWARG flag,
        // since KW_SPLAT means all args have been slurped up into a hash. Only a
        // single kw hash argument is passed to the method.
        if (found_kwsplat) {
            call_data.flag |= CallDataFlag.KW_SPLAT;
        } else if (kw_arg.length > 0) {
            call_data.flag |= CallDataFlag.KWARG;
        }

        call_data.kw_arg = kw_arg;
    }

    private populate_call_data_block(node: NodeWithBlock, call_data: CallData) {
        let block_iseq = null;

        switch (node.block?.constructor.name) {
            case "BlockNode":
                block_iseq = this.with_used(true, () => this.visitBlockNode(node.block as BlockNode));
                call_data.flag |= CallDataFlag.BLOCKISEQ
                break;
            case "BlockArgumentNode":
                call_data.flag |= CallDataFlag.ARGS_BLOCKARG;
                this.with_used(true, () => this.visit(node.block!));
                break;
        }

        if (call_data.flag == 0 && !block_iseq) {
            call_data.flag |= CallDataFlag.ARGS_SIMPLE;
        }

        return block_iseq;
    }

    override visitCallNode(node: CallNode) {
        if (node.receiver) {
            this.with_used(true, () => this.visit(node.receiver!));
        } else {
            this.iseq.putself();
        }

        let safe_label = null;

        if (node.isSafeNavigation()) {
            safe_label = this.iseq.label();
            this.iseq.dup();
            this.iseq.branchnil(safe_label);
        }

        const call_data = MethodCallData.create(node.name);

        if (node.arguments_) {
            this.populate_call_data_args(node.arguments_, call_data);
        }

        const block_iseq = this.populate_call_data_block(node, call_data);

        if (!node.receiver) {
            call_data.flag |= CallDataFlag.FCALL;
        }

        if (node.isVariableCall()) {
            call_data.flag |= CallDataFlag.VCALL;
        }

        if (call_data.argc == 1 && !call_data.includes_block()) {
            switch (call_data.mid) {
                case "+":
                    this.iseq.opt_plus(call_data);
                    break;
                case "*":
                    this.iseq.opt_mult(call_data);
                    break;
                default:
                    this.iseq.send_without_block(call_data);
            }
        } else if (call_data.includes_block()) {
            this.iseq.send(call_data, block_iseq);
        } else {
            this.iseq.send_without_block(call_data);
        }

        if (safe_label) {
            this.iseq.jump(safe_label);
            this.iseq.push(safe_label);
        }

        if (!this.used) {
            this.iseq.pop();
        }
    }

    private extractMultiTargetLocals(node: MultiTargetNode): string[] {
        const locals: string[] = [];

        for (const left of node.lefts) {
            if (left instanceof LocalVariableTargetNode) {
                locals.push(left.name);
            } else if (left instanceof RequiredParameterNode) {
                locals.push(left.name);
            } else if (left instanceof MultiTargetNode) {
                locals.push(...this.extractMultiTargetLocals(left));
            }
        }

        if (node.rest) {
            const rest = node.rest as SplatNode;

            if (rest.expression instanceof LocalVariableTargetNode) {
                locals.push(rest.expression.name);
            } else if (rest.expression instanceof RequiredParameterNode) {
                locals.push(rest.expression.name);
            }
        }

        for (const right of node.rights) {
            if (right instanceof LocalVariableTargetNode) {
                locals.push(right.name);
            } else if (right instanceof RequiredParameterNode) {
                locals.push(right.name);
            } else if (right instanceof MultiTargetNode) {
                locals.push(...this.extractMultiTargetLocals(right));
            }
        }

        return locals;
    }

    override visitBlockNode(node: BlockNode): InstructionSequence {
        const block_begin_label = this.iseq.label();
        const block_end_label = this.iseq.label();

        this.iseq.push(block_begin_label);

        const block_iseq = this.with_child_iseq(this.iseq.block_child_iseq(this.location_to_source_location(node.location)!, this.lexical_scope_stack.current()!), () => {
            const begin_label = this.iseq.label();
            const end_label = this.iseq.label();

            // for generating destructuring instructions
            const multi_targets: Array<{index: number, node: MultiTargetNode}> = [];
            const nested_locals = new Set<string>();
            const all_param_names = new Set<string>();

            if (node.parameters && node.parameters instanceof BlockParametersNode) {
                const block_params = node.parameters as BlockParametersNode;

                if (block_params.parameters) {
                    const params = block_params.parameters;

                    for (let i = 0; i < params.requireds.length; i ++) {
                        const req = params.requireds[i];

                        if (req instanceof MultiTargetNode) {
                            multi_targets.push({
                                index: i,
                                node: req
                            });

                            for (const name of this.extractMultiTargetLocals(req)) {
                                nested_locals.add(name);
                                all_param_names.add(name);
                            }
                        } else if (req instanceof RequiredParameterNode) {
                            all_param_names.add(req.name);
                        }
                    }
                }
            }

            // add block parameters FIRST, before other local variables
            if (node.parameters) {
                this.with_used(true, () => this.visit(node.parameters!));
            }

            // add block-local variables, but exclude ALL parameter names
            // (parameters have already been added by visiting the parameters node)
            if (node.locals) {
                for (const local of node.locals) {
                    if (!all_param_names.has(local)) {
                        this.iseq.local_table.plain(local);
                    }
                }
            }

            this.iseq.push(begin_label);

            // destructuring instructions for MultiTargetNodes (must be at the beginning of the block body)
            for (const {index, node: multi_target} of multi_targets) {
                const placeholder_lookup = this.iseq.local_table.find_or_throw(`?@${index}`, 0);

                this.iseq.getlocal(placeholder_lookup.index, 0);

                let flags = 0;
                if (multi_target.rest) flags |= ExpandArrayFlag.SPLAT_FLAG;
                this.iseq.expandarray(multi_target.lefts.length, flags);

                for (const left of multi_target.lefts) {
                    if (left instanceof LocalVariableTargetNode) {
                        const local_lookup = this.iseq.local_table.find_or_throw(left.name, 0);
                        this.iseq.setlocal(local_lookup.index, 0);
                    } else if (left instanceof RequiredParameterNode) {
                        const local_lookup = this.iseq.local_table.find_or_throw(left.name, 0);
                        this.iseq.setlocal(local_lookup.index, 0);
                    }
                }

                if (multi_target.rest) {
                    const rest = multi_target.rest as SplatNode;

                    if (rest.expression) {
                        if (rest.expression instanceof LocalVariableTargetNode) {
                            if (multi_target.rights.length > 0) {
                                const flags = ExpandArrayFlag.SPLAT_FLAG | ExpandArrayFlag.POSTARG_FLAG;
                                this.iseq.expandarray(1, flags);
                            }

                            const local_lookup = this.iseq.local_table.find_or_throw(rest.expression.name, 0);
                            this.iseq.setlocal(local_lookup.index, 0);
                        } else if (rest.expression instanceof RequiredParameterNode) {
                            if (multi_target.rights.length > 0) {
                                const flags = ExpandArrayFlag.SPLAT_FLAG | ExpandArrayFlag.POSTARG_FLAG;
                                this.iseq.expandarray(1, flags);
                            }

                            const local_lookup = this.iseq.local_table.find_or_throw(rest.expression.name, 0);
                            this.iseq.setlocal(local_lookup.index, 0);
                        }
                    }
                }

                // post params
                for (const right of multi_target.rights) {
                    if (right instanceof LocalVariableTargetNode) {
                        const local_lookup = this.iseq.local_table.find_or_throw(right.name, 0);
                        this.iseq.setlocal(local_lookup.index, 0);
                    } else if (right instanceof RequiredParameterNode) {
                        const local_lookup = this.iseq.local_table.find_or_throw(right.name, 0);
                        this.iseq.setlocal(local_lookup.index, 0);
                    }
                }
            }

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.push(end_label);
            this.iseq.leave();

            this.iseq.catch_table.catch_next(begin_label, end_label, end_label, 0);
        });

        this.iseq.push(block_end_label);
        this.iseq.catch_table.catch_break(this.iseq, block_begin_label, block_end_label, block_end_label, 0);

        return block_iseq;
    }

    override visitIntegerNode(node: IntegerNode) {
        if (this.used) {
            // @ts-ignore
            this.iseq.putobject({ type: "Integer", value: node.value });
        }
    }

    override visitFloatNode(node: FloatNode) {
        if (this.used) {
            // @ts-ignore
            this.iseq.putobject({ type: "Float", value: node.value });
        }
    }

    override visitStringNode(node: StringNode) {
        if (!this.used) return

        this.iseq.putstring(
            node.unescaped.value,
            this.encoding_for_string_node(node),
            node.isFrozen(),
            node.isForcedBinaryEncoding()
        );
    }

    private encoding_for_string_node(node: StringNode | XStringNode): RValue {
        if (node.isForcedBinaryEncoding() || !node.unescaped.validEncoding) {
            return Encoding.binary;
        } else if (node.isForcedUtf8Encoding()) {
            return Encoding.get_or_throw("UTF-8");
        } else {
            return Encoding.get_or_throw(node.unescaped.encoding);
        }
    }

    override visitLocalVariableReadNode(node: LocalVariableReadNode) {
        const lookup = this.find_local_or_throw(node.name, node.depth);

        if (this.used) {
            this.iseq.getlocal(lookup.index, lookup.depth);
        }
    }

    override visitLocalVariableWriteNode(node: LocalVariableWriteNode) {
        this.with_used(true, () => this.visit(node.value));

        if (this.used) {
            this.iseq.dup();
        }

        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitLocalVariableAndWriteNode(node: LocalVariableAndWriteNode) {
        const label = this.iseq.label();

        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.getlocal(lookup.index, lookup.depth);
        if (this.used) this.iseq.dup();
        this.iseq.branchunless(label);

        if (this.used) this.iseq.pop()
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup()
        this.iseq.setlocal(lookup.index, lookup.depth);

        this.iseq.push(label);
    }

    override visitLocalVariableOrWriteNode(node: LocalVariableOrWriteNode) {
        const defined_label = this.iseq.label();
        const done_label = this.iseq.label();

        this.iseq.putobject({type: "TrueClass", value: true});
        this.iseq.branchunless(defined_label);

        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.getlocal(lookup.index, lookup.depth);
        if (this.used) this.iseq.dup();
        this.iseq.branchif(done_label);

        if (this.used) this.iseq.pop();
        this.iseq.push(defined_label);
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();
        this.iseq.setlocal(lookup.index, lookup.depth);

        this.iseq.push(done_label);
    }

    override visitLocalVariableOperatorWriteNode(node: LocalVariableOperatorWriteNode) {
        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.getlocal(lookup.index, lookup.depth);
        this.with_used(true, () => this.visit(node.value));
        this.iseq.send(MethodCallData.create(node.binaryOperator, 1), null);
        if (this.used) this.iseq.dup();
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitLocalVariableTargetNode(node: LocalVariableTargetNode) {
        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitIndexTargetNode(node: IndexTargetNode): void {
        // do we need with_used(true) here?
        this.visit(node.receiver);
        if (node.arguments_) this.visit(node.arguments_)
    }

    override visitMultiWriteNode(node: MultiWriteNode) {
        const state = new MultiTargetState();
        const writes = new InstructionList();
        const cleanup = new InstructionList();
        const ret = new InstructionList();

        state.position = this.used ? 1 : 0;
        this.compile_multi_target_node(this.iseq, node, ret, writes, cleanup, state);

        const value_insns = this.with_used<InstructionList>(true, () => {
            return this.capture(() => this.visit(node.value));
        });

        ret.push_list(value_insns);

        if (this.used) {
            ret.dup();
        }

        ret.push_list(writes);

        if (this.used && state.stack_size >= 1) {
            // Make sure the value on the right-hand side of the = operator is
            // being returned before we pop the parent expressions.
            ret.setn(state.stack_size);
        }

        // Now, we need to go back and modify the topn instructions in order to
        // ensure they can correctly retrieve the parent expressions.
        this.multi_target_state_update(state);

        ret.push_list(cleanup);

        this.iseq.push_list(ret);
    }

    /**
     * Compile a multi target or multi write node. It returns the number of values
     * on the stack that correspond to the parent expressions of the various
     * targets.
     */
    compile_multi_target_node(iseq: InstructionSequence, node: Node, parents: InstructionList, writes: InstructionList, cleanup: InstructionList, state: MultiTargetState) {
        let lefts: Node[];
        let rest: Node | null;
        let rights: Node[];

        if (node instanceof MultiTargetNode || node instanceof MultiWriteNode) {
            lefts = node.lefts;
            rest = node.rest;
            rights = node.rights;
        } else {
            throw new Error(`Unsupported node ${node.constructor.name}`);
        }

        const has_rest = rest != null && rest instanceof SplatNode && rest.expression != null;
        const has_posts = rights.length > 0;

        // The first instruction in the writes sequence is going to spread the
        // top value of the stack onto the number of values that we're going to
        // write.
        writes.expandarray(lefts.length, (has_rest || has_posts) ? 1 : 0);

        // We need to keep track of some additional state information as we're
        // going through the targets because we will need to revisit them once
        // we know how many values are being pushed onto the stack.
        const target_state = new MultiTargetState();
        if (state == null) state = target_state;

        const base_position = state.position;
        const splat_position = (has_rest || has_posts) ? 1 : 0;

        // Next, we'll iterate through all of the leading targets.
        for (let index = 0; index < lefts.length; index ++) {
            const target = lefts[index];
            state.position = lefts.length - index + splat_position + base_position;
            this.compile_target_node(iseq, target, parents, writes, cleanup, state);
        }

        // Next, we'll compile the rest target if there is one.
        if (has_rest) {
            const target = (rest as SplatNode).expression;
            state.position = 1 + rights.length + base_position;

            if (has_posts) {
                writes.expandarray(rights.length, 3);
            }

            this.compile_target_node(iseq, target, parents, writes, cleanup, state);
        }

        // Finally, we'll compile the trailing targets.
        if (has_posts) {
            if (!has_rest && rest != null) {
                writes.expandarray(rights.length, 2);
            }

            for (let index = 0; index < rights.length; index ++) {
                const target = rights[index];
                state.position = rights.length - index + base_position;
                this.compile_target_node(iseq, target, parents, writes, cleanup, state);
            }
        }
    }

    /**
     * A target node represents an indirect write to a variable or a method call to
     * a method ending in =. Compiling one of these nodes requires three sequences:
     *
     * * The first is to compile retrieving the parent expression if there is one.
     *   This could be the object that owns a constant or the receiver of a method
     *   call.
     * * The second is to compile the writes to the targets. This could be writing
     *   to variables, or it could be performing method calls.
     * * The third is to compile any cleanup that needs to happen, i.e., popping the
     *   appropriate number of values off the stack.
     *
     * When there is a parent expression and this target is part of a multi write, a
     * topn instruction will be inserted into the write sequence. This is to move
     * the parent expression to the top of the stack so that it can be used as the
     * receiver of the method call or the owner of the constant. To facilitate this,
     * we return a pointer to the topn instruction that was used to be later
     * modified with the correct offset.
     *
     * These nodes can appear in a couple of places, but most commonly:
     *
     * * For loops - the index variable is a target node
     * * Rescue clauses - the exception reference variable is a target node
     * * Multi writes - the left hand side contains a list of target nodes
     *
     * For the comments with examples within this function, we'll use for loops as
     * the containing node.
     */
    compile_target_node(iseq: InstructionSequence, node: Node | null, parents: InstructionList, writes: InstructionList, cleanup: InstructionList, state: MultiTargetState) {
        if (node instanceof LocalVariableTargetNode) {
            // Local variable targets have no parent expression, so they only need
            // to compile the write.
            //
            //     for i in []; end
            //
            const lookup = this.iseq.local_table.find_or_throw(node.name, node.depth);
            writes.setlocal(lookup.index, lookup.depth);
        } else if (node instanceof ClassVariableTargetNode) {
            // Class variable targets have no parent expression, so they only need
            // to compile the write.
            //
            //     for @@i in []; end
            //
            writes.setclassvariable(node.name);
        } else if (node instanceof ConstantTargetNode) {
            // Constant targets have no parent expression, so they only need to
            // compile the write.
            //
            //     for I in []; end
            //
            writes.putspecialobject(SpecialObjectType.CONST_BASE);
            writes.setconstant(node.name);
        } else if (node instanceof GlobalVariableTargetNode) {
            // Global variable targets have no parent expression, so they only need
            // to compile the write.
            //
            //     for $i in []; end
            //
            writes.setglobal(node.name);
        } else if (node instanceof InstanceVariableTargetNode) {
            // Instance variable targets have no parent expression, so they only
            // need to compile the write.
            //
            //     for @i in []; end
            //
            writes.setinstancevariable(node.name);
        } else if (node instanceof ConstantPathTargetNode) {
            // Constant path targets have a parent expression that is the object
            // that owns the constant. This needs to be compiled first into the
            // parents sequence. If no parent is found, then it represents using the
            // unary :: operator to indicate a top-level constant. In that case we
            // need to push Object onto the stack.
            //
            //     for I::J in []; end
            //

            if (node.parent != null) {
                const const_lookup = this.with_used(true, () => {
                    return this.capture(() => {
                        this.visit(node.parent!);
                    });
                });

                parents.push_list(const_lookup);
            } else {
                parents.putobject({ type: "RValue", value: ObjectClass });
            }

            if (state === null) {
                writes.swap();
            } else {
                writes.topn(1);
                this.multi_target_state_push(state, writes.tail_node as InsnNode<TopN>, 1);
            }

            writes.setconstant(node.name!);

            if (state !== null) {
                cleanup.pop();
            }
        } else if (node instanceof CallTargetNode) {
            // Call targets have a parent expression that is the receiver of the
            // method being called. This needs to be compiled first into the parents
            // sequence. These nodes cannot have arguments, so the method call is
            // compiled with a single argument which represents the value being
            // written.
            //
            //     for i.j in []; end
            //
            const receiver = this.with_used(true, () => {
                return this.capture(() => {
                    this.visit(node.receiver);
                });
            });

            parents.push_list(receiver);

            let safe_label: Label | null = null;

            if (node.isSafeNavigation()) {
                safe_label = new Label();
                parents.dup();
                parents.branchnil(safe_label);
            }

            if (state !== null) {
                writes.topn(1);
                this.multi_target_state_push(state, writes.tail_node as InsnNode<TopN>, 1);
                writes.swap();
            }

            let flags = CallDataFlag.ARGS_SIMPLE;

            if (node.isIgnoreVisibility()) {
                flags |= CallDataFlag.FCALL;
            }

            writes.send(new MethodCallData(node.name, 1, flags, null), null);

            if (safe_label !== null && state === null) {
                writes.push(safe_label);
            }

            writes.pop();

            if (safe_label !== null && state !== null) {
                writes.push(safe_label);
            }

            if (state !== null) {
                cleanup.pop();
            }
        } else if (node instanceof IndexTargetNode) {
            // Index targets have a parent expression that is the receiver of the
            // method being called and any additional arguments that are being
            // passed along with the value being written. The receiver and arguments
            // both need to be on the stack. Note that this is even more complicated
            // by the fact that these nodes can hold a block using the unary &
            // operator.
            //
            //     for i[:j] in []; end
            //
            const receiver = this.with_used(true, () => {
                return this.capture(() => {
                    this.visit(node.receiver);
                });
            });

            parents.push_list(receiver);

            const call_data = MethodCallData.create(node.isAttributeWrite() ? "[]=" : "[]");

            if (node.arguments_) {
                const args = this.capture(() => {
                    this.populate_call_data_args(node.arguments_!, call_data);
                });

                parents.push_list(args);
            }

            if (state !== null) {
                writes.topn(call_data.argc + 1);
                this.multi_target_state_push(state, writes.tail_node as InsnNode<TopN>, call_data.argc + 1);

                if (call_data.argc === 0) {
                    writes.swap();
                } else {
                    for (let index = 0; index < call_data.argc; index ++) {
                        writes.topn(call_data.argc + 1);
                    }

                    writes.topn(call_data.argc + 1);
                }
            }

            // The argc that we're going to pass to the send instruction is the
            // number of arguments + 1 for the value being written. If there's a
            // splat, then we need to insert newarray and concatarray instructions
            // after the arguments have been written.
            let ci_argc = call_data.argc + 1;

            if (call_data.has_flag(CallDataFlag.ARGS_SPLAT)) {
                ci_argc --;
                writes.newarray(1);
                writes.concatarray();
            }

            // use ci_argc for the method call
            const write_call_data = MethodCallData.create("[]=", ci_argc, call_data.flag, call_data.kw_arg);

            writes.send(write_call_data, null);
            writes.pop();

            if (state !== null) {
                if (call_data.argc !== 0) {
                    writes.pop();
                }

                for (let index = 0; index < call_data.argc + 1; index ++) {
                    cleanup.pop();
                }
            }
        } else if (node instanceof MultiTargetNode) {
            // Multi target nodes represent a set of writes to multiple variables.
            // The parent expressions are the combined set of the parent expressions
            // of its inner target nodes.
            //
            //     for i, j in []; end
            //
            let before_position: number = 0;

            if (state !== null) {
                before_position = state.position;
                state.position --;
            }

            this.compile_multi_target_node(iseq, node, parents, writes, cleanup, state);
            if (state !== null) state.position = before_position;
        } else if (node instanceof SplatNode) {
            // Splat nodes capture all values into an array. They can be used
            // as targets in assignments or for loops.
            //
            //     for *x in []; end
            //
            if (node.expression !== null) {
                this.compile_target_node(iseq, node.expression, parents, writes, cleanup, state);
            }
        } else {
            throw new Error(`Unexpected node type: ${node ? node.constructor.name : "null"}`);
        }
    }

    /**
     * Push a new state node onto the multi target state.
     */
    multi_target_state_push(state: MultiTargetState, topn: InsnNode<TopN>, stack_size: number) {
        const state_node = new MultiTargetStateNode();
        state_node.topn = topn;
        state_node.stack_index = state.stack_size + 1;
        state_node.stack_size = stack_size;
        state_node.position = state.position;
        state_node.next = null;

        if (state.head === null) {
            state.head = state_node;
            state.tail = state_node;
        } else {
            state.tail!.next = state_node;
            state.tail = state_node;
        }

        state.stack_size += stack_size;
    }

    /**
     * Walk through a multi target state's linked list and update the topn
     * instructions that were inserted into the write sequence to make sure they can
     * correctly retrieve their parent expressions.
     */
    multi_target_state_update(state: MultiTargetState) {
        // If nothing was ever pushed onto the stack, then we don't need to do any
        // kind of updates.
        if (state.stack_size == 0) return;

        let current = state.head;

        while (current != null) {
            const offset = state.stack_size - current.stack_index + current.position;
            current.topn!.instruction.index = offset;

            // stack_size will be > 1 in the case that we compiled an index target
            // and it had arguments. In this case, we use multiple topn instructions
            // to grab up all of the arguments, so those offsets need to be updated
            // as well.
            if (current.stack_size > 1) {
                let insn = current.topn!;

                for (let index = 1; index < current.stack_size; index += 1) {
                    insn = insn.next_node as InsnNode<TopN>;
                    // RUBY_ASSERT(IS_INSN(element));

                    // RUBY_ASSERT(insn->insn_id == BIN(topn));

                    insn.instruction.index = offset;
                }
            }

            current = current.next;
        }
    }

    override visitArrayNode(node: ArrayNode) {
        this.visitAll(node.elements);

        if (this.used) {
            // don't wrap single-element arrays that only contain a splat node
            if (node.elements.length !== 1 || !(node.elements[0] instanceof SplatNode)) {
                this.iseq.newarray(node.elements.length);
            }
        }
    }

    override visitHashNode(node: HashNode) {
        let length = 0;

        node.elements.forEach((element) => {
            if (element.constructor.name == "AssocSplatNode") {
                if (this.used) {
                    if (length > 0) {
                        this.iseq.newhash(length);
                        this.iseq.putspecialobject(SpecialObjectType.VMCORE);
                        this.iseq.swap();
                    } else {
                        this.iseq.putspecialobject(SpecialObjectType.VMCORE);
                        this.iseq.newhash(length);
                    }

                    length = 0;
                }

                this.visit(element);

                if (this.used) {
                    const call_data = MethodCallData.create("hash_merge_kwd", 2);
                    this.iseq.send(call_data, null);
                }
            } else {
                this.visit(element);
                length += 2;
            }
        });

        if (this.used) {
            this.iseq.newhash(node.elements.length * 2);
        }
    }

    override visitAssocNode(node: AssocNode) {
        this.visit(node.key);

        // I don't understand how value could ever be null, but whatevs
        if (node.value) {
            this.visit(node.value);
        }
    }

    override visitDefNode(node: DefNode) {
        const end_offset =
            (node.endKeywordLoc ? node.endKeywordLoc.startOffset + node.endKeywordLoc.length : null) ||
            (node.body && node.body.location ? node.body!.location.startOffset + node.body!.location.length : null);

        const start_coords = this.offset_to_coords(node.defKeywordLoc.startOffset);
        const end_coords = this.offset_to_coords(end_offset);

        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(
                this.iseq.file,
                this.coords_to_source_location(start_coords, end_coords)
            )
        );

        const name = node.name;
        const method_iseq = this.iseq.method_child_iseq(name, this.location_to_source_location(node.location)!, lexical_scope);

        this.with_child_iseq(method_iseq, () => {
            node.locals.forEach((local) => {
                this.iseq.local_table.plain(local)
            });

            if (node.parameters) {
                this.with_used(true, () => this.visit(node.parameters!));
            }

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave()
        })

        const parameters_meta = this.get_parameters_meta(node.parameters);

        if (node.receiver) {
            this.with_used(true, () => this.visit(node.receiver!));
            this.iseq.definesmethod(name, method_iseq, parameters_meta, lexical_scope)
        } else {
            this.iseq.definemethod(name, method_iseq, parameters_meta, lexical_scope);
        }

        if (this.used) {
            this.iseq.putobject({type: "Symbol", value: name});
        }
    }

    private get_parameters_meta(node: ParametersNode | null): ParameterMetadata[] {
        if (!node) return []

        const builder = new ParametersMetadataBuilder();
        const children = node.childNodes();

        for (const req of node.requireds as RequiredParameterNode[]) {
            builder.req(req.name, children.indexOf(req));
        }

        for (const opt of node.optionals as OptionalParameterNode[]) {
            builder.opt(opt.name, children.indexOf(opt));
        }

        if (node.rest) {
            const rest = node.rest as RestParameterNode;
            builder.rest(rest.name || "*", children.indexOf(rest));
        }

        for (const post of node.posts as RequiredParameterNode[]) {
            builder.req(post.name, children.indexOf(post));
        }

        for (const keyword of node.keywords) {
            if (keyword instanceof RequiredKeywordParameterNode) {
                builder.keyreq(keyword.name, children.indexOf(keyword));
            } else if (keyword instanceof OptionalKeywordParameterNode) {
                builder.key(keyword.name, children.indexOf(keyword));
            }
        }

        if (node.keywordRest) {
            const keyword_rest = node.keywordRest as KeywordRestParameterNode;
            builder.keyrest(keyword_rest.name || "**", children.indexOf(keyword_rest));
        }

        if (node.block) {
            builder.block(node.block.name || "&", children.indexOf(node.block));
        }

        return builder.parameters;
    }

    // (required, optional = nil, *rest, post, keywords:, **keywordRest, &block)
    override visitParametersNode(node: ParametersNode) {
        // track repeated parameters (i.e. duplicate underscore params)
        const repeated_params: number[] = [];

        // Track MultiTargetNodes for nested destructuring
        const multi_target_nodes: MultiTargetNode[] = [];

        for (let i = 0; i < node.requireds.length; i ++) {
            const param = node.requireds[i];

            if (param instanceof MultiTargetNode) {
                multi_target_nodes.push(param);
            } else if (param instanceof RequiredParameterNode) {
                if (param.isRepeatedParameter && param.isRepeatedParameter()) {
                    repeated_params.push(i);
                }
            }
        }

        if (repeated_params.length > 0) {
            this.iseq.argument_options.repeated_params = repeated_params;
        }

        // First pass: Add all argument parameters to the local table
        // For MultiTargetNodes, add a placeholder local (like ?@0 in CRuby)
        for (let i = 0; i < node.requireds.length; i ++) {
            const param = node.requireds[i];

            if (param instanceof MultiTargetNode) {
                // Add a placeholder local for the nested array (like ?@0 in CRuby)
                this.iseq.local_table.plain(`?@${i}`);
            } else {
                this.with_used(true, () => this.visit(param));
            }
        }

        // Second pass: Add all nested locals from MultiTargetNodes
        for (const multi_target of multi_target_nodes) {
            this.with_used(true, () => this.visit(multi_target));
        }

        this.iseq.argument_options.lead_num = node.requireds.length;
        this.with_used(true, () => this.visitAll(node.optionals));
        this.iseq.argument_size += node.requireds.length + node.optionals.length;

        if (node.rest) {
            this.iseq.argument_options.rest_start = this.iseq.argument_size
            this.with_used(true, () => this.visit(node.rest!));

            // only increment argument_size if the rest parameter has a name, since
            // anonymous splats don't get a local
            if ((node.rest as RestParameterNode).name) {
                this.iseq.argument_size ++;
            }
        }

        // posts are of type RequiredParameterNode
        if (node.posts) {
            // track repeated parameters here too
            const post_offset = node.requireds.length + node.optionals.length + (node.rest ? 1 : 0);

            for (let i = 0; i < node.posts.length; i ++) {
                const param = node.posts[i] as RequiredParameterNode;

                if (param.isRepeatedParameter && param.isRepeatedParameter()) {
                    if (!this.iseq.argument_options.repeated_params) {
                        this.iseq.argument_options.repeated_params = [];
                    }

                    this.iseq.argument_options.repeated_params.push(post_offset + i);
                }
            }

            this.iseq.argument_options.post_start = this.iseq.argument_size;
            this.with_used(true, () => this.visitAll(node.posts));
            this.iseq.argument_size += node.posts.length;
            this.iseq.argument_options.post_num = node.posts.length;
        }

        if (node.keywords) {
            if (!(node.keywordRest instanceof NoKeywordsParameterNode) && node.keywords.length > 0) {
                this.iseq.argument_options.keyword = [];
                this.iseq.argument_options.keyword_bits_index = this.iseq.local_table.keyword_bits();
                this.with_used(true, () => this.visitAll(node.keywords));
                this.iseq.argument_size += this.iseq.argument_options.keyword.length;
            }
        }

        if (node.keywordRest) {
            if (node.keywordRest instanceof ForwardingParameterNode) {
                this.with_used(true, () => this.visit(node.keywordRest!));
            } else if (!(node.keywordRest instanceof NoKeywordsParameterNode)) {
                const keywordRestNode = node.keywordRest as KeywordRestParameterNode;

                // only mark start of kwargs if the kwrest parameter has a name
                if (keywordRestNode.name) {
                    this.iseq.argument_options.keyword_rest_start = this.iseq.argument_size;
                    this.with_used(true, () => this.visit(node.keywordRest!));
                    this.iseq.argument_size ++;
                } else {
                    // This branch handles anonymous kwrest args (i.e. **). We mark that we accept
                    // kwargs but don't add to argument_size or local table. -2 is a special sentinel
                    // value for anonymous kwrest args (see setup_arguments() execution-context.ts).
                    this.iseq.argument_options.keyword_rest_start = -2;
                }
            }
        }

        if (node.block) {
            this.iseq.argument_options.block_start = this.iseq.argument_size;
            this.with_used(true, () => this.visit(node.block!));
            this.iseq.argument_size ++;
        }
    }

    override visitKeywordRestParameterNode(node: KeywordRestParameterNode): void {
        // Add the keyword rest parameter to the local table if it has a name
        if (node.name) {
            this.iseq.local_table.plain(node.name);
        }
    }

    override visitForwardingParameterNode(node: ForwardingParameterNode): void {
        this.iseq.local_table.plain("*")
        this.iseq.local_table.block("&")
        this.iseq.local_table.plain("...")

        // forwarding all parameters implies forwarding kwargs and a block
        this.iseq.argument_options.rest_start = this.iseq.argument_size;

        // -1 indicates kwrest is passed as the last argument in the positional args array
        this.iseq.argument_options.keyword_rest_start = -1;
        this.iseq.argument_size ++;

        this.iseq.argument_options.block_start = this.iseq.argument_size;
        this.iseq.argument_size ++;
    }

    // Eg. foo, = []
    override visitImplicitRestNode(node: ImplicitRestNode) {
        // Do we need to do anything here?
    }

    override visitForwardingArgumentsNode(node: ForwardingArgumentsNode): void {
        let current_iseq: InstructionSequence | null = this.iseq;
        let depth = 0;

        while (current_iseq && !current_iseq.local_table.find("...")) {
          current_iseq = current_iseq.parent_iseq;
          depth ++;
        }

        if (!current_iseq) {
            throw new SyntaxError("Forwarding arguments (...) used outside of a method that accepts forwarding parameters");
        }

        let lookup = this.find_local_or_throw("*", depth);
        this.iseq.getlocal(lookup.index, lookup.depth);
        this.iseq.splatarray(false);

        lookup = this.find_local_or_throw("&", depth);
        this.iseq.getblockparamproxy(lookup.index, lookup.depth);
    }

    override visitRequiredKeywordParameterNode(node: RequiredKeywordParameterNode) {
        this.iseq.argument_options.keyword!.push([node.name, null]);
        this.iseq.local_table.plain(node.name);
    }

    override visitOptionalKeywordParameterNode(node: OptionalKeywordParameterNode) {
        this.iseq.argument_options.keyword!.push([node.name, Qnil]);
        const keyword_index = this.iseq.argument_options.keyword!.length - 1;

        const skip_label = this.iseq.label();
        const keyword_bits_index = this.iseq.argument_options.keyword_bits_index!;
        const local_index = this.iseq.local_table.plain(node.name);

        this.iseq.checkkeyword(keyword_bits_index, keyword_index);
        this.iseq.branchif(skip_label);
        this.visit(node.value);
        this.iseq.setlocal(local_index, 0);

        this.iseq.push(skip_label);
    }

    override visitRequiredParameterNode(node: RequiredParameterNode) {
        this.iseq.local_table.plain(node.name);
    }

    override visitMultiTargetNode(node: MultiTargetNode) {
        // MultiTargetNode represents nested destructuring in block parameters, e.g., |(a, b), c|
        // We need to add all the nested parameters to the local table.
        // The actual destructuring will be handled at the beginning of the block.

        const locals = this.extractMultiTargetLocals(node);

        for (const local of locals) {
            this.iseq.local_table.plain(local);
        }
    }

    override visitOptionalParameterNode(node: OptionalParameterNode) {
        let index = this.iseq.argument_options.lead_num || 0;
        const opt_length = this.iseq.argument_options.opt.length;

        if (opt_length > 0) {
            index += opt_length - 1;
        }

        this.iseq.local_table.plain(node.name);

        if (this.iseq.argument_options.opt.length == 0) {
            const start_label = this.iseq.label();
            this.iseq.push(start_label);
            this.iseq.argument_options.opt.push(start_label);
        }

        this.with_used(true, () => this.visit(node.value));
        this.iseq.setlocal(index, 0);

        const arg_given_label = this.iseq.label()
        this.iseq.push(arg_given_label);
        this.iseq.argument_options.opt.push(arg_given_label);
    }

    override visitRestParameterNode(node: RestParameterNode) {
        if (node.name) {
            this.iseq.local_table.plain(node.name);
        }
    }

    override visitSplatNode(node: SplatNode) {
        if (node.expression) {
            this.visit(node.expression);
            this.iseq.splatarray(true);
        }
    }

    override visitBlockParameterNode(node: BlockParameterNode) {
        // no-op
    }

    override visitBlockArgumentNode(node: BlockArgumentNode) {
        if (node.expression) {
            // named block, eg. def foo(&block)
            this.visit(node.expression);
        } else {
            // anonymous block, eg. def foo(&)
            const lookup = this.find_local_or_throw("&", 0);

            if (this.used) {
                this.iseq.getlocal(lookup.index, lookup.depth);
            }
        }
    }

    override visitIfNode(node: IfNode) {
        const body_label = this.iseq.label();
        const else_label = this.iseq.label();
        const done_label = this.iseq.label();

        this.with_used(true, () => this.visit(node.predicate));

        this.iseq.branchunless(else_label);
        this.iseq.jump(body_label);
        this.iseq.push(body_label);

        if (node.statements) {
            this.visit(node.statements);
        } else {
            if (this.used) this.iseq.putnil();
        }

        this.iseq.jump(done_label);
        if (this.used) this.iseq.pop();
        this.iseq.push(else_label);

        if (node.subsequent) {
            this.visit(node.subsequent);
        } else {
            if (this.used) this.iseq.putnil();
        }

        this.iseq.push(done_label);
    }

    override visitUnlessNode(node: UnlessNode) {
        const body_label = this.iseq.label();
        const else_label = this.iseq.label();
        const done_label = this.iseq.label();

        this.with_used(true, () => this.visit(node.predicate));
        this.iseq.branchunless(body_label);
        this.iseq.jump(else_label);

        this.iseq.push(else_label);

        if (node.elseClause) {
            this.visit(node.elseClause);
        } else {
            if (this.used) {
                this.iseq.putnil();
            }
        }

        this.iseq.jump(done_label);

        if (this.used) {
            this.iseq.pop();
        }

        this.iseq.push(body_label);

        if (node.statements) {
          this.visit(node.statements);
        } else {
            if (this.used) {
                this.iseq.putnil();
            }
        }

        this.iseq.push(done_label);
    }

    override visitElseNode(node: ElseNode) {
        if (node.statements) {
            this.visit(node.statements);
        }
    }

    override visitAndNode(node: AndNode) {
        const label = this.iseq.label()

        this.with_used(true, () => this.visit(node.left));
        if (this.used) this.iseq.dup();
        this.iseq.branchunless(label)
        if (this.used) this.iseq.pop();
        this.with_used(true, () => this.visit(node.right));
        this.iseq.push(label);
        if (!this.used) this.iseq.pop();
    }

    override visitOrNode(node: OrNode) {
        const label = this.iseq.label();

        this.with_used(true, () => this.visit(node.left));
        if (this.used) this.iseq.dup();
        this.iseq.branchif(label);
        if (this.used) this.iseq.pop();
        this.with_used(true, () => this.visit(node.right));
        this.iseq.push(label);
        if (!this.used) this.iseq.pop();
    }

    override visitClassNode(node: ClassNode) {
        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(
                this.iseq.file,
                this.locations_to_source_location(node.classKeywordLoc, node.endKeywordLoc)!,
                this.lexical_scope_stack.current()
            )
        );

        const class_iseq = this.iseq.class_child_iseq(node.name, this.location_to_source_location(node.location)!, lexical_scope);

        this.with_child_iseq(class_iseq, () => {
            node.locals.forEach((local) => {
                this.iseq.local_table.plain(local)
            });

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave();
        });

        let flags = DefineClassFlags.TYPE_CLASS;
        const constant_path = node.constantPath;

        if (constant_path.constructor.name == "ConstantReadNode") {
            this.iseq.putspecialobject(SpecialObjectType.CONST_BASE);
        } else if ((constant_path as any).parent == null) {
            flags |= DefineClassFlags.FLAG_SCOPED;
            this.iseq.putobject({type: "RValue", value: ObjectClass});
        } else {
            flags |= DefineClassFlags.FLAG_SCOPED;
            this.with_used(true, () => this.visit((constant_path as any).parent));
        }

        if (node.superclass) {
            flags |= DefineClassFlags.FLAG_HAS_SUPERCLASS;
            this.with_used(true, () => this.visit(node.superclass!));
        } else {
            this.iseq.putnil();
        }

        this.iseq.defineclass(node.name, class_iseq, flags);

        if (!this.used) {
            this.iseq.pop();
        }
    }

    override visitModuleNode(node: ModuleNode) {
        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(
                this.iseq.file,
                this.locations_to_source_location(node.moduleKeywordLoc, node.endKeywordLoc)!,
                this.lexical_scope_stack.current()
            )
        );

        const module_iseq = this.iseq.module_child_iseq(node.name, this.location_to_source_location(node.location)!, lexical_scope);

        this.with_child_iseq(module_iseq, () => {
            node.locals.forEach((local) => {
                this.iseq.local_table.plain(local)
            });

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave();
        });

        let flags = DefineClassFlags.TYPE_MODULE;
        const constant_path = node.constantPath;

        if (constant_path.constructor.name == "ConstantReadNode") {
            this.iseq.putspecialobject(SpecialObjectType.CONST_BASE);
        } else if ((constant_path as any).parent == null) {
            flags |= DefineClassFlags.FLAG_SCOPED;
            this.iseq.putobject({type: "RValue", value: ObjectClass});
        } else {
            flags |= DefineClassFlags.FLAG_SCOPED;
            this.with_used(true, () => this.visit((constant_path as any).parent));
        }

        this.iseq.putnil() // superclass
        this.iseq.defineclass(node.name, module_iseq, flags);

        if (!this.used) {
            this.iseq.pop();
        }
    }

    override visitConstantReadNode(node: ConstantReadNode) {
        if (this.used) {
            this.iseq.putnil();
            this.iseq.putobject({type: "TrueClass", value: true});
            this.iseq.getconstant(node.name)
        }
    }

    override visitConstantWriteNode(node: ConstantWriteNode) {
        this.with_used(true, () => this.visit(node.value));

        if (this.used) {
            this.iseq.dup();
        }

        this.iseq.putspecialobject(SpecialObjectType.CONST_BASE);
        this.iseq.setconstant(node.name);
    }

    override visitCallOperatorWriteNode(node: CallOperatorWriteNode): void {
        this.with_used(true, () => this.visit(node.receiver!));
        this.iseq.dup();
        this.iseq.send(MethodCallData.create(node.readName), null);
        this.with_used(true, () => this.visit(node.value));
        this.iseq.send(MethodCallData.create(node.binaryOperator, 1), null);
        this.iseq.swap();
        this.iseq.topn(1);
        this.iseq.send(MethodCallData.create(node.writeName, 1), null);
        this.iseq.pop();
    }

    override visitSymbolNode(node: SymbolNode) {
        if (this.used) {
            this.iseq.putobject({type: "Symbol", value: node.unescaped.value});
        }
    }

    override visitBlockParametersNode(node: BlockParametersNode) {
        if (node.parameters) {
            this.visit(node.parameters);
        }
    }

    override visitInstanceVariableWriteNode(node: InstanceVariableWriteNode) {
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();
        this.iseq.setinstancevariable(node.name);
    }

    override visitInstanceVariableReadNode(node: InstanceVariableReadNode) {
        if (this.used) {
            this.iseq.getinstancevariable(node.name);
        }
    }

    override visitInstanceVariableTargetNode(node: InstanceVariableTargetNode) {
        this.iseq.setinstancevariable(node.name);
    }

    override visitReturnNode(node: ReturnNode) {
        if (node.arguments_) {
            if (node.arguments_.arguments_.length == 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
            } else if (node.arguments_.arguments_.length > 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
                this.iseq.newarray(node.arguments_.arguments_.length);
            }
        } else {
            this.iseq.putnil();
        }

        // throw if inside a block iseq
        switch (this.iseq.type) {
            // no idea if this is correct
            case "rescue":
                return;

            case "method":
                this.iseq.leave();
                return;

            case "block":
                this.iseq.throw(ThrowType.RETURN);
                return;
        }

        throw new SyntaxError("Invalid return");
    }

    // this handles begin...end but also inline rescues, ensures, etc in method bodies
    override visitBeginNode(node: BeginNode) {
        const begin_label = this.iseq.label();
        const end_label = this.iseq.label();
        const cont_label = this.iseq.label();
        const else_label = this.iseq.label();

        this.iseq.push(begin_label);

        if (node.statements) {
            const [first_statements, last_statement] = this.split_rest_last(node.statements.body);
            this.with_used(true, () => this.visitAll(first_statements));
            this.visit(last_statement);

            if (node.elseClause) {
                this.iseq.jump(else_label);
            } else {
                this.iseq.jump(cont_label);
            }
        } else {
            this.iseq.putnil();
        }

        this.iseq.push(end_label);

        // Rescue clauses execute in a so-called "transparent" scope, which we and MRI accomplish
        // by pushing a stack frame. Locals inside this frame are actually tracked in the parent
        // frame, so local depth needs to be incremented and added to the depth calculated by Prism.
        // Not all Ruby implementations use a stack frame for rescue clauses, so Prism doesn't
        // increase the depth for rescues. See https://github.com/ruby/prism/pull/1908 for more info.
        this.local_depth ++;

        if (node.rescueClause) {
            const rescue_iseq = this.iseq.rescue_child_iseq(this.location_to_source_location(node.location)!, this.lexical_scope_stack.current());

            this.with_child_iseq(rescue_iseq, () => {
                this.with_used(true, () => this.visit(node.rescueClause!));
            });

            this.iseq.catch_table.catch_rescue(
                rescue_iseq, begin_label, end_label, cont_label, rescue_iseq.local_table.size()
            );
        }

        this.local_depth --;

        if (node.elseClause) {
            this.iseq.push(else_label);
            this.visit(node.elseClause);
        }

        this.iseq.push(cont_label);

        if (node.ensureClause) {
            this.local_depth ++;

            const ensure_iseq = this.iseq.ensure_child_iseq(
                this.location_to_source_location(node.ensureClause.location)!,
                this.lexical_scope_stack.current()
            );

            this.with_child_iseq(ensure_iseq, () => {
                ensure_iseq.local_table.plain("$!");
                this.with_used(false, () => this.visit(node.ensureClause!));
                ensure_iseq.getlocal(0, 0);
                ensure_iseq.throw(ThrowType.NONE);

                // Ensure clauses are run inside their own stack frame. If no error occurred,
                // then the .throw() above will do nothing and we need to manually leave()
                // the frame.
                ensure_iseq.leave();
            });

            this.local_depth --;

            // Visit the ensure clause again. The frame created above runs if an error occurs,
            // while these instructions will run if no error occurs.
            this.with_used(false, () => this.visit(node.ensureClause!));

            this.iseq.catch_table.catch_ensure(ensure_iseq, begin_label, end_label, cont_label, 0);
        }
    }

    override visitRescueNode(node: RescueNode) {
        const handled_label = this.iseq.label();
        const unhandled_label = this.iseq.label();
        const exit_label = this.iseq.label();

        if (node.exceptions.length > 0) {
            // check if raised exception is an instance of any of the rescuable exception classes
            node.exceptions.forEach((exception) => {
                this.iseq.getlocal(0, 0);
                this.with_used(true, () => this.visit(exception));
                this.iseq.send(MethodCallData.create("is_a?", 1), null);
                this.iseq.branchif(handled_label);
            });

            // none of the exceptions matched
            this.iseq.jump(unhandled_label);
        } else {
            // rescue StandardError by default
            this.iseq.getlocal(0, 0);
            this.iseq.putnil(); // scope to look up constant
            this.iseq.putobject({type: "TrueClass", value: Qtrue}); // allow nil scope
            this.iseq.getconstant("StandardError");
            this.iseq.send(MethodCallData.create("is_a?", 1), null);
            this.iseq.branchif(handled_label);
            this.iseq.jump(unhandled_label);
        }

        this.iseq.push(handled_label);

        if (node.statements) {
            if (node.reference) {
                this.with_used(true, () => this.visit(node.reference!));
            }

            this.visit(node.statements);
        }

        this.iseq.jump(exit_label);

        this.iseq.push(unhandled_label);

        if (node.subsequent) {
            this.visitRescueNode(node.subsequent);
        }

        // nothing handled the error, so re-raise
        this.iseq.putself();
        this.iseq.getlocal(0, 0);
        this.iseq.send(MethodCallData.create("raise", 1), null);

        this.iseq.push(exit_label);
        this.iseq.leave();
    }

    override visitEnsureNode(node: EnsureNode) {
        if (node.statements) {
            this.visit(node.statements);
        }
    }

    // Handles inline rescue modifier syntax: expression rescue rescue_expression
    // e.g., a = 1/0 rescue 1
    override visitRescueModifierNode(node: RescueModifierNode) {
        const begin_label = this.iseq.label();
        const end_label = this.iseq.label();
        const cont_label = this.iseq.label();

        this.iseq.push(begin_label);

        // Execute the main expression
        this.visit(node.expression);
        this.iseq.jump(cont_label);

        this.iseq.push(end_label);

        // Rescue clauses execute in a "transparent" scope with increased local depth
        this.local_depth ++;

        // Create a rescue child iseq that handles StandardError by default
        const rescue_iseq = this.iseq.rescue_child_iseq(
            this.location_to_source_location(node.location)!,
            this.lexical_scope_stack.current()
        );

        this.with_child_iseq(rescue_iseq, () => {
            const handled_label = rescue_iseq.label();
            const unhandled_label = rescue_iseq.label();
            const exit_label = rescue_iseq.label();

            // Rescue modifier always rescues StandardError by default (no explicit exception types)
            rescue_iseq.getlocal(0, 0);
            rescue_iseq.putnil(); // scope to look up constant
            rescue_iseq.putobject({type: "TrueClass", value: Qtrue}); // allow nil scope
            rescue_iseq.getconstant("StandardError");
            rescue_iseq.send(MethodCallData.create("is_a?", 1), null);
            rescue_iseq.branchif(handled_label);
            rescue_iseq.jump(unhandled_label);

            rescue_iseq.push(handled_label);

            // Execute the rescue expression
            this.with_used(true, () => this.visit(node.rescueExpression));

            rescue_iseq.jump(exit_label);

            rescue_iseq.push(unhandled_label);

            // Nothing handled the error, so re-raise
            rescue_iseq.putself();
            rescue_iseq.getlocal(0, 0);
            rescue_iseq.send(MethodCallData.create("raise", 1), null);

            rescue_iseq.push(exit_label);
            rescue_iseq.leave();
        });

        this.iseq.catch_table.catch_rescue(
            rescue_iseq, begin_label, end_label, cont_label, rescue_iseq.local_table.size()
        );

        this.local_depth --;

        this.iseq.push(cont_label);
    }

    override visitNilNode(_node: NilNode) {
        if (this.used) {
            this.iseq.putnil();
        }
    }

    override visitTrueNode(_node: TrueNode) {
        if (this.used) {
            this.iseq.putobject({type: "TrueClass", value: true});
        }
    }

    override visitFalseNode(_node: FalseNode) {
        if (this.used) {
            this.iseq.putobject({type: "FalseClass", value: false});
        }
    }

    override visitInterpolatedStringNode(node: InterpolatedStringNode) {
        for (const part of node.parts) {
            this.with_used(true, () => this.visit(part));
            this.iseq.dup();
            this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
            this.iseq.anytostring()
        }

        this.iseq.concatstrings(node.parts.length);

        if (!this.used) {
            this.iseq.pop()
        }
    }

    override visitEmbeddedVariableNode(node: EmbeddedVariableNode) {
        this.visit(node.variable);
    }

    override visitInterpolatedSymbolNode(node: InterpolatedSymbolNode) {
        for (const part of node.parts) {
            this.with_used(true, () => this.visit(part));
            this.iseq.dup();
            this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
            this.iseq.anytostring()
        }

        this.iseq.concatstrings(node.parts.length);
        this.iseq.intern();
    }

    override visitInterpolatedXStringNode(node: InterpolatedXStringNode) {
        for (const part of node.parts) {
            this.with_used(true, () => this.visit(part));
            this.iseq.dup();
            this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
            this.iseq.anytostring()
        }

        this.iseq.concatstrings(node.parts.length);

        if (!this.used) {
            this.iseq.pop()
        }
    }

    override visitEmbeddedStatementsNode(node: EmbeddedStatementsNode) {
        if (node.statements) {
            this.visit(node.statements);
        }
    }

    override visitSelfNode(node: SelfNode) {
        if (this.used) {
            this.iseq.putself();
        }
    }

    override visitConstantPathNode(node: ConstantPathNode) {
        if (!node.name) return

        if (node.parent == null) {
            this.iseq.putobject({type: "RValue", value: ObjectClass});
            this.iseq.putobject({type: "TrueClass", value: true});
        } else {
            this.visit(node.parent);
            this.iseq.putobject({type: "FalseClass", value: false});
        }

        this.iseq.getconstant(node.name);
    }

    override visitConstantPathWriteNode(node: ConstantPathWriteNode) {
        if (!node.target.name) return;

        if (node.target.parent) {
            this.with_used(true, () => this.visit(node.target.parent!));
        } else {
            this.iseq.putobject({type: "RValue", value: ObjectClass});
        }

        this.with_used(true, () => this.visit(node.value));

        if (this.used) {
            this.iseq.swap();
            this.iseq.topn(1);
        }

        this.iseq.swap();
        this.iseq.setconstant(node.target.name);
    }

    override visitParenthesesNode(node: ParenthesesNode) {
        if (node.body) {
            this.visit(node.body);
        } else {
            if (this.used) {
                this.iseq.putnil();
            }
        }
    }

    override visitInstanceVariableOperatorWriteNode(node: InstanceVariableOperatorWriteNode) {
        this.iseq.getinstancevariable(node.name);
        this.with_used(true, () => this.visit(node.value));
        this.iseq.send(MethodCallData.create(node.binaryOperator, 1), null);

        if (this.used) {
            this.iseq.dup();
        }

        this.iseq.setinstancevariable(node.name);
    }

    override visitGlobalVariableReadNode(node: GlobalVariableReadNode) {
        if (this.used) {
            this.iseq.getglobal(node.name);
        }
    }

    override visitGlobalVariableWriteNode(node: GlobalVariableWriteNode) {
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup()
        this.iseq.setglobal(node.name);
    }

    override visitGlobalVariableOrWriteNode(node: GlobalVariableOrWriteNode) {
        const defined_label = this.iseq.label();
        const undefined_label = this.iseq.label();

        this.iseq.putnil();
        this.iseq.defined(DefinedType.GVAR, node.name, Qtrue);
        this.iseq.branchunless(defined_label);

        this.iseq.getglobal(node.name);
        if (this.used) this.iseq.dup();
        this.iseq.branchif(undefined_label);

        if (this.used) this.iseq.pop();
        this.iseq.push(defined_label);
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();
        this.iseq.setglobal(node.name);

        this.iseq.push(undefined_label);
    }

    override visitGlobalVariableTargetNode(node: GlobalVariableTargetNode) {
        this.iseq.setglobal(node.name);
    }

    override visitCaseNode(node: CaseNode) {
        if (node.predicate) {
            this.with_used(true, () => this.visit(node.predicate!));
        }

        const done_label = this.iseq.label();
        const labels: Label[] = [];

        (node.conditions as WhenNode[]).forEach((clause) => {
            const label = this.iseq.label();

            clause.conditions.forEach((condition) => {
                if (condition instanceof SplatNode) {
                    // splatted array case, eg. `when *foo`

                    // stack before: [target]
                    // we need: [target, target, array] before checkmatch
                    this.iseq.dup();

                    if (condition.expression) {
                        this.with_used(true, () => this.visit(condition.expression!));
                        this.iseq.splatarray(false);
                    }

                    // stack: [target, target, array]
                    this.iseq.checkmatch(CheckMatchType.TYPE_CASE | CheckMatchType.ARRAY_SPLAT);
                    this.iseq.branchif(label);
                } else {
                    // normal case, i.e. `when "foo"`
                    this.with_used(true, () => this.visit(condition));
                    this.iseq.topn(1);
                    this.iseq.send(MethodCallData.create("===", 1, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE), null);
                    this.iseq.branchif(label);
                }
            });

            labels.push(label);
        });

        this.iseq.pop();

        if (node.elseClause) {
            this.visit(node.elseClause);
        } else {
            if (this.used) {
                this.iseq.putnil();
            }
        }

        this.iseq.jump(done_label);

        (node.conditions as WhenNode[]).forEach((clause, index) => {
            this.iseq.push(labels[index]);
            this.iseq.pop();

            if (clause.statements) {
                this.visit(clause.statements);
            } else {
                this.iseq.putnil();
            }

            this.iseq.jump(done_label);
        });

        this.iseq.push(done_label);
    }

    override visitImplicitNode(node: ImplicitNode): void {
        this.visit(node.value);
    }

    override visitKeywordHashNode(node: KeywordHashNode) {
        let all_keys_are_symbols = true;

        for (const element of node.elements) {
            if (element instanceof AssocNode) {
                if (!(element.key instanceof SymbolNode)) {
                    all_keys_are_symbols = false;
                    break;
                }
            } else {
                all_keys_are_symbols = false;
                break;
            }
        }

        /* Optimization: if all keys are symbols, we can pass the values as extra
         * positional args and read them in-order in the send instruction. The
         * order is important since the kwargs identified in visitCallMethod will
         * need to be matched up 1:1 to these extra positional args.
         */
        if (all_keys_are_symbols) {
            /* The CallData object maintains information about the kwargs
             * a method was called with, meaning we don't have to visit the
             * keys here, just the values. The send instruction will sort
             * everything out.
             */
            for (const element of node.elements) {
                const value = (element as AssocNode).value;
                if (value) this.with_used(true, () => this.visit(value));
            }

            return
        }

        /* Optimization: if the only parameter is a kwsplat, visit it to produce a hash
         * and push it onto the stack. No other logic is necessary.
         */
        if (node.elements.length === 1 && node.elements[0] instanceof AssocSplatNode) {
            const element = node.elements[0] as AssocSplatNode;

            if (element.value) {
                this.with_used(true, () => this.visit(element.value!));
            }

            return;
        }

        let index = 0;

        // Find leading symbol-keyed kwargs
        for (index = 0; index < node.elements.length; index ++) {
            const element = node.elements[index];

            if (element instanceof AssocNode) {
                this.with_used(true, () => {
                    this.visit(element.key);
                    this.visit(element.value);
                });
            } else {
                break;
            }
        }

        this.iseq.newhash(index * 2);

        while (index < node.elements.length) {
            this.iseq.putspecialobject(SpecialObjectType.VMCORE);
            this.iseq.swap();

            if (node.elements[index] instanceof AssocNode) {
                const old_index = index;

                while (index < node.elements.length && node.elements[index] instanceof AssocNode) {
                    const element = node.elements[index] as AssocNode;

                    this.with_used(true, () => {
                        this.visit(element.key);
                        this.visit(element.value);
                    });

                    index ++;
                }

                this.iseq.send(MethodCallData.create("hash_merge_ptr", (index - old_index) * 2 + 1), null);
            } else if (node.elements[index] instanceof AssocSplatNode) {
                const element = node.elements[index] as AssocSplatNode;

                if (element.value) {
                    this.with_used(true, () => this.visit(element.value!));
                }

                this.iseq.send(MethodCallData.create("hash_merge_kwd", 2), null);
                index ++;
            } else {
                throw new Error(`Unexpected node type '${node.elements[index].constructor.name}'`);
            }
        }
    }

    override visitInstanceVariableOrWriteNode(node: InstanceVariableOrWriteNode) {
        const label = this.iseq.label();

        this.iseq.getinstancevariable(node.name);
        if (this.used) this.iseq.dup();
        this.iseq.branchif(label);

        if (this.used) this.iseq.pop()
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();
        this.iseq.setinstancevariable(node.name);

        this.iseq.push(label);
    }

    override visitYieldNode(node: YieldNode) {
        let argc = 0;
        let flags = CallDataFlag.ARGS_SIMPLE;

        if (node.arguments_) {
            for (const argument of node.arguments_.arguments_) {
                if (argument instanceof SplatNode) {
                    flags = CallDataFlag.ARGS_SPLAT;
                } else if (argument instanceof KeywordHashNode) {
                    // Check if this is a keyword splat (**kwargs)
                    for (const element of argument.elements) {
                        if (element instanceof AssocSplatNode) {
                            flags |= CallDataFlag.KW_SPLAT;
                            break;
                        }
                    }
                }
            }

            this.with_used(true, () => this.visit(node.arguments_!));
            argc = node.arguments_.arguments_.length;
        }

        this.iseq.invokeblock(new BlockCallData(argc, flags, null));
        if (!this.used) this.iseq.pop();
    }

    override visitSingletonClassNode(node: SingletonClassNode) {
        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(
                this.iseq.file,
                this.locations_to_source_location(node.classKeywordLoc, node.endKeywordLoc)!,
                this.lexical_scope_stack.current()
            )
        );

        this.with_used(true, () => this.visit(node.expression));
        this.iseq.putnil()

        const singleton_iseq = this.iseq.singleton_class_child_iseq(this.location_to_source_location(node.location)!, lexical_scope);

        this.with_child_iseq(singleton_iseq, () => {
            node.locals.forEach((local) => {
                this.iseq.local_table.plain(local)
            });

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave();
        });

        this.iseq.defineclass("singletonclass", singleton_iseq, DefineClassFlags.TYPE_SINGLETON_CLASS);
        if (!this.used) this.iseq.pop();
    }

    override visitWhileNode(node: WhileNode) {
        const predicate_label = this.iseq.label();
        const body_label = this.iseq.label();
        const done_label = this.iseq.label();

        this.local_catch_table_stack.with_catch_table(() => {
            this.local_catch_table_stack.catch_break(null, body_label, done_label, done_label, 0);
            this.local_catch_table_stack.catch_next(body_label, done_label, predicate_label, 0);
            this.local_catch_table_stack.catch_redo(body_label, done_label, body_label, 0);

            this.iseq.jump(predicate_label);
            this.iseq.putnil();  // why is this here?
            this.iseq.pop();
            this.iseq.jump(predicate_label);

            this.iseq.push(body_label);

            if (node.statements) {
                this.with_used(false, () => this.visit(node.statements!));
            }

            this.iseq.push(predicate_label);
            this.with_used(true, () => this.visit(node.predicate));
            this.iseq.branchunless(done_label);

            this.iseq.jump(body_label);
            this.iseq.push(done_label);

            this.iseq.putnil();
            if (!this.used) this.iseq.pop();
        });
    }

    override visitUntilNode(node: UntilNode) {
        const predicate_label = this.iseq.label();
        const body_label = this.iseq.label();
        const done_label = this.iseq.label();

        this.local_catch_table_stack.with_catch_table(() => {
            this.local_catch_table_stack.catch_break(null, body_label, done_label, done_label, 0);
            this.local_catch_table_stack.catch_next(body_label, done_label, predicate_label, 0);
            this.local_catch_table_stack.catch_redo(body_label, done_label, body_label, 0);
            this.iseq.jump(predicate_label);
            this.iseq.putnil();  // why is this here?
            this.iseq.pop();
            this.iseq.jump(predicate_label);

            this.iseq.push(body_label);

            if (node.statements) {
                this.with_used(false, () => this.visit(node.statements!));
            }

            this.iseq.push(predicate_label);
            this.with_used(true, () => this.visit(node.predicate));
            this.iseq.branchunless(body_label);

            this.iseq.jump(done_label);
            this.iseq.push(done_label);

            this.iseq.putnil();
            if (!this.used) this.iseq.pop();
        });
    }

    override visitRegularExpressionNode(node: RegularExpressionNode) {
        if (this.used) {
            // @TODO: handle all options
            const flags = Regexp.build_flags(node.isIgnoreCase(), node.isMultiLine(), node.isExtended());
            const regexp_class = ObjectClass.get_data<Module>().constants["Regexp"];
            const ascii_encoding = node.isForcedBinaryEncoding() || node.isForcedUsAsciiEncoding() || node.isAscii8bit();
            const regexp = new RValue(regexp_class, Regexp.compile(node.unescaped.value, flags, ascii_encoding));
            this.iseq.putobject({type: "RValue", value: regexp});
        }
    }

    override visitInterpolatedRegularExpressionNode(node: InterpolatedRegularExpressionNode) {
        for (const part of node.parts) {
            this.with_used(true, () => this.visit(part));
            this.iseq.dup();
            this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
            this.iseq.anytostring();
        }

        const flags = Regexp.build_flags(node.isIgnoreCase(), node.isMultiLine(), node.isExtended());

        // @TODO: handle options
        this.iseq.toregexp(flags, node.parts.length);
        if (!this.used) this.iseq.pop();
    }

    override visitNextNode(node: NextNode) {
        if (node.arguments_) {
            if (node.arguments_.arguments_.length == 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
            } else if (node.arguments_.arguments_.length > 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
                this.iseq.newarray(node.arguments_.arguments_.length);
            }
        } else {
            this.iseq.putnil();
        }

        const catch_entry = this.local_catch_table_stack.find_catch_entry(CatchNext);

        if (catch_entry) {
            this.iseq.jump(catch_entry.cont_label);
            return;
        } else {
            let iseq = this.iseq;

            // skip past rescue and ensure frames, which aren't actually frames
            while (iseq.type === "rescue" || iseq.type === "ensure") {
                if (iseq.parent_iseq) {
                    iseq = iseq.parent_iseq;
                } else {
                    break;
                }
            }

            // throw if inside a block iseq
            if (iseq.type === "block") {
                this.iseq.throw(ThrowType.NEXT);
                return;
            }
        }

        throw new SyntaxError("Invalid next");
    }

    override visitBreakNode(node: BreakNode) {
        if (node.arguments_) {
            if (node.arguments_.arguments_.length == 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
            } else if (node.arguments_.arguments_.length > 1) {
                this.with_used(true, () => this.visit(node.arguments_!));
                this.iseq.newarray(node.arguments_.arguments_.length);
            }
        } else {
            this.iseq.putnil();
        }

        const catch_entry = this.local_catch_table_stack.find_catch_entry(CatchBreak);

        if (catch_entry) {
            this.iseq.jump(catch_entry.cont_label);
            return;
        } else {
            let iseq = this.iseq;

            // skip past rescue and ensure frames, which aren't actually frames
            while (iseq.type === "rescue" || iseq.type === "ensure") {
                if (iseq.parent_iseq) {
                    iseq = iseq.parent_iseq;
                } else {
                    break;
                }
            }

            // throw if inside a block iseq
            if (iseq.type === "block") {
                this.iseq.throw(ThrowType.BREAK);
                return;
            }
        }

        throw new SyntaxError("Invalid break");
    }

    override visitRetryNode(_node: RetryNode) {
        let iseq = this.iseq;

        // retry is only valid inside a rescue block
        if (iseq.type === "rescue") {
            this.iseq.throw(ThrowType.RETRY);
            return;
        }

        throw new SyntaxError("Invalid retry");
    }

    override visitLambdaNode(node: LambdaNode) {
        const lexical_scope = this.lexical_scope_stack.push(
            new LexicalScope(
                this.iseq.file,
                this.locations_to_source_location(node.openingLoc, node.closingLoc)!,
                this.lexical_scope_stack.current()
            )
        );

        const lambda_iseq = this.iseq.block_child_iseq(this.location_to_source_location(node.location)!, lexical_scope);

        this.with_child_iseq(lambda_iseq, () => {
            if (node.parameters) {
                this.with_used(true, () => this.visit(node.parameters!));
            }

            for (const local of node.locals) {
                this.iseq.local_table.plain(local);
            }

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave();
        });

        // These two lines result in a send instruction that wraps the given block_iseq in a Proc object.
        // The Proc gets pushed onto the stack and eventually passed to VMCore#lambda, which simply
        // returns it.
        this.iseq.putspecialobject(SpecialObjectType.VMCORE);
        this.iseq.send(MethodCallData.create("lambda", 0, CallDataFlag.FCALL), lambda_iseq);

        if (!this.used) {
            this.iseq.pop();
        }
    }

    override visitIndexOrWriteNode(node: IndexOrWriteNode) {
        const already_set = this.iseq.label();
        const done = this.iseq.label();

        this.iseq.putnil();

        if (node.receiver) {
            this.with_used(true, () => this.visit(node.receiver!));
        } else {
            // not sure how we ever get here, since "[0] ||= 1" is invalid syntax
            this.iseq.putself();
        }

        let arg_size = 0;

        if (node.arguments_) {
            this.with_used(true, () => this.visit(node.arguments_!));
            arg_size += node.arguments_.arguments_.length;
        }

        // dup receiver and arguments so we don't have to visit them again for []=
        this.iseq.dupn(1 + arg_size);

        // get value at index
        // this.iseq.opt_aref(MethodCallData.create("[]", arg_size, CallDataFlag.FCALL, null));
        this.iseq.send(MethodCallData.create("[]", arg_size, CallDataFlag.FCALL, null), null);

        // branchif pops, so dup top instruction to return it; test for truthiness
        this.iseq.dup();
        this.iseq.branchif(already_set);

        // remove duped value, since we won't be returning it
        this.iseq.pop();

        this.with_used(true, () => this.visit(node.value));

        // copy the new value above our args so it can be returned
        this.iseq.setn(2 + arg_size);

        // +1 for assigned value, the last argument
        // this.iseq.opt_aset(MethodCallData.create("[]=", arg_size + 1, CallDataFlag.FCALL, null));
        this.iseq.send(MethodCallData.create("[]=", arg_size + 1, CallDataFlag.FCALL, null), null);
        this.iseq.pop();
        this.iseq.jump(done);

        this.iseq.push(already_set);

        // copy the existing above our args so it can be returned
        this.iseq.setn(2 + arg_size);

        // []= was not called, so pop duped receiver and args
        this.iseq.adjuststack(2 + arg_size);

        this.iseq.push(done);
    }

    override visitRangeNode(node: RangeNode) {
        if (node.left) {
            this.visit(node.left);
        } else if (this.used) {
            this.iseq.putnil();
        }

        if (node.right) {
            this.visit(node.right);
        } else if (this.used) {
            this.iseq.putnil();
        }

        if (this.used) this.iseq.newrange(node.isExcludeEnd());
    }

    override visitSuperNode(node: SuperNode) {
        const call_data = MethodCallData.create("super");
        call_data.flag |= CallDataFlag.FCALL | CallDataFlag.SUPER;

        if (node.arguments_) {
            this.populate_call_data_args(node.arguments_, call_data);
        }

        if (!node.arguments_ && !node.lparenLoc) {
            call_data.flag |= CallDataFlag.ZSUPER;
        }

        const block_iseq = this.populate_call_data_block(node, call_data);

        this.iseq.putself();
        this.iseq.invokesuper(call_data, block_iseq);

        if (!this.used) this.iseq.pop();
    }

    override visitForwardingSuperNode(node: ForwardingSuperNode) {
        let flags = CallDataFlag.FCALL | CallDataFlag.SUPER | CallDataFlag.ZSUPER;
        let block_iseq = null;

        if (node.block) {
          block_iseq = this.with_used<InstructionSequence>(true, () => this.visitBlockNode(node.block as BlockNode));
        } else {
          flags |= CallDataFlag.ARGS_SIMPLE;
        }

        this.iseq.putself();
        this.iseq.invokesuper(MethodCallData.create("super", 0, flags), block_iseq);
        if (!this.used) this.iseq.pop();
    }

    override visitXStringNode(node: XStringNode) {
        this.iseq.putself();

        this.iseq.putstring(
            node.unescaped.value,
            this.encoding_for_string_node(node),
            false,
            node.isForcedBinaryEncoding()
        );

        this.iseq.send(MethodCallData.create("`", 1, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE), null);
        if (!this.used) this.iseq.pop()
    }

    override visitNumberedReferenceReadNode(node: NumberedReferenceReadNode) {
        if (this.used) {
            this.iseq.getspecial(GetSpecialType.BACKREF, node.number << 1);
        }
    }

    override visitSourceFileNode(node: SourceFileNode) {
        if (this.used) {
            // Determine encoding using the same logic as visitStringNode
            let encoding: RValue | undefined;

            if (node.isForcedBinaryEncoding() || !node.filepath.validEncoding) {
                encoding = Encoding.binary;
            } else if (node.isForcedUtf8Encoding()) {
                encoding = Encoding.get_or_throw("UTF-8");
            } else {
                encoding = Encoding.get_or_throw(node.filepath.encoding);
            }

            this.iseq.putstring(
                this.absolute_path,
                encoding,
                node.isFrozen(),
                node.isForcedBinaryEncoding()
            );
        }
    }

    override visitSourceLineNode(_node: SourceLineNode) {
        if (this.used) {
            this.iseq.putobject({value: this.current_line, type: "Integer"});
        }
    }

    override visitIndexOperatorWriteNode(node: IndexOperatorWriteNode) {
        if (node.arguments_) {
            const argc = node.arguments_.arguments_.length;

            if (this.used) this.iseq.putnil();
            if (node.receiver) {
                this.with_used(true, () => this.visit(node.receiver!));
            }
            this.with_used(true, () => this.visit(node.arguments_!));
            this.iseq.dupn(argc + 1);
            this.iseq.send(MethodCallData.create("[]", argc), null);
            this.with_used(true, () => this.visit(node.value));
            this.iseq.send(MethodCallData.create(node.binaryOperator, 1), null);
            if (this.used) this.iseq.setn(argc + 2);
            this.iseq.send(MethodCallData.create("[]=", 1 + argc), null)
            this.iseq.pop();
        } else {
            if (node.receiver) {
                this.with_used(true, () => this.visit(node.receiver!));
            }
            this.iseq.dup();
            this.iseq.send(MethodCallData.create("[]"), null);
            this.with_used(true, () => this.visit(node.value));
            this.iseq.send(MethodCallData.create(node.binaryOperator, 1), null);

            if (this.used) {
                this.iseq.swap();
                this.iseq.topn(1);
            }

            this.iseq.send(MethodCallData.create("[]=", 1), null);
            this.iseq.pop();
        }
    }

    override visitDefinedNode(node: DefinedNode) {
        if (!this.used) return;

        const finish: [Label | null] = [null];
        this.compile_defined(node.value, finish);

        // Eventually there needs to be a begin/rescue around this that jumps to finish,
        // since defined?() calls accept certain types of expressions that can raise.
        // For now we just push the label.
        if (finish[0]) {
            this.iseq.push(finish[0]);
        }
    }

    private compile_defined(node: Node, finish: [Label | null]) {
        if (node instanceof CallNode) {
            this.iseq.putself();
            this.iseq.defined(DefinedType.FUNC, node.name, this.iseq.make_string("method"));
        } else if (node instanceof ClassVariableReadNode) {
            this.iseq.defined(DefinedType.CVAR, node.name, this.iseq.make_string("class variable"));
        } else if (node instanceof ConstantPathNode) {
            if (!node.name) {
                this.iseq.putnil();
                return null;
            }

            if (node.parent == null) {
                this.iseq.putobject({type: "RValue", value: ObjectClass});
                this.iseq.defined(DefinedType.CONST_FROM, node.name, this.iseq.make_string("constant", Encoding.us_ascii, true));
            } else {
                if (!finish[0]) finish[0] = this.iseq.label();
                this.compile_defined(node.parent, finish);
                this.iseq.branchunless(finish[0]);
                this.visit(node.parent);
            }

            this.iseq.defined(DefinedType.CONST_FROM, node.name, this.iseq.make_string("constant", Encoding.us_ascii, true));
        } else if (node instanceof ConstantReadNode) {
            this.iseq.putnil(); // defined instruction always pops one value
            this.iseq.defined(DefinedType.CONST, node.name, this.iseq.make_string("constant", Encoding.us_ascii, true));
        } else if (node instanceof FalseNode) {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("true", Encoding.us_ascii, true)});
        } else if (node instanceof ForwardingSuperNode) {
            this.iseq.putself();
            this.iseq.defined(DefinedType.ZSUPER, "", this.iseq.make_string("super", Encoding.us_ascii, true));
        } else if (node instanceof GlobalVariableReadNode) {
            this.iseq.defined(DefinedType.GVAR, node.name, this.iseq.make_string("global-variable", Encoding.us_ascii, true));
        } else if (node instanceof LocalVariableReadNode) {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("local-variable", Encoding.us_ascii, true)});
        } else if (node instanceof LocalVariableWriteNode || node instanceof InstanceVariableWriteNode) {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("assignment", Encoding.us_ascii, true)});
        } else if (node instanceof NilNode) {
            this.iseq.putobject({type: "NilClass", value: Qnil});
        } else if (node instanceof SelfNode) {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("self", Encoding.us_ascii, true)});
        } else if (node instanceof TrueNode) {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("true", Encoding.us_ascii, true)});
        } else if (node instanceof YieldNode) {
            this.iseq.putnil();
            this.iseq.defined(DefinedType.YIELD, "", this.iseq.make_string("yield", Encoding.us_ascii, true));
        } else if (node instanceof InstanceVariableReadNode) {
            this.iseq.putself();
            this.iseq.defined(DefinedType.IVAR, node.name, this.iseq.make_string("instance-variable", Encoding.us_ascii, true));
        } else {
            this.iseq.putobject({type: "RValue", value: this.iseq.make_string("expression", Encoding.us_ascii, true)});
        }
    }

    override visitClassVariableWriteNode(node: ClassVariableWriteNode) {
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();
        this.iseq.setclassvariable(node.name);
    }

    override visitClassVariableReadNode(node: ClassVariableReadNode) {
        if (this.used) {
            this.iseq.getclassvariable(node.name);
        }
    }

    override visitClassVariableOrWriteNode(node: ClassVariableOrWriteNode) {
        const defined_label = this.iseq.label();
        const undefined_label = this.iseq.label();

        this.iseq.putnil();
        this.iseq.defined(DefinedType.CVAR, node.name, Qtrue);
        this.iseq.branchunless(defined_label);

        this.iseq.getclassvariable(node.name)
        if (this.used) this.iseq.dup;
        this.iseq.branchif(undefined_label);

        if (this.used) this.iseq.pop();
        this.iseq.push(defined_label);

        this.with_used(true, () => { this.visit(node.value) });

        if (this.used) this.iseq.dup();
        this.iseq.setclassvariable(node.name)
        this.iseq.push(undefined_label);
    }

    override visitNumberedParametersNode(node: NumberedParametersNode) {
        this.iseq.getlocal(node.maximum - 1, 0);
    }

    override visitAliasMethodNode(node: AliasMethodNode) {
        this.iseq.putspecialobject(SpecialObjectType.VMCORE);
        this.iseq.putspecialobject(SpecialObjectType.CBASE)
        this.with_used(true, () => this.visit(node.newName));
        this.with_used(true, () => this.visit(node.oldName));
        this.iseq.send(MethodCallData.create("set_method_alias", 3), null);
        if (!this.used) this.iseq.pop();
    }

    override visitAliasGlobalVariableNode(node: AliasGlobalVariableNode): void {
        this.iseq.putspecialobject(SpecialObjectType.VMCORE);
        this.iseq.putspecialobject(SpecialObjectType.CBASE)
        this.iseq.putstring((node.newName as GlobalVariableReadNode).name, Encoding.get_or_throw("UTF-8"), true);
        this.iseq.putstring((node.oldName as GlobalVariableReadNode).name, Encoding.get_or_throw("UTF-8"), true);
        this.iseq.send(MethodCallData.create("set_variable_alias", 3), null);
        if (!this.used) this.iseq.pop();
    }

    override visitBackReferenceReadNode(node: BackReferenceReadNode) {
        if (this.used) {
            this.iseq.getspecial(GetSpecialType.BACKREF, node.name.slice(1).charCodeAt(0) << 1 | 1);
        }
    }

    private find_local_or_throw(name: string, depth: number): Lookup {
        let current_iseq = this.iseq;

        for (let i = 0; i < depth; i ++) {
            current_iseq = current_iseq.parent_iseq!;
        }

        const lookup = current_iseq.local_table.find(name, depth);
        if (lookup) return lookup;

        for (let i = 0; i < this.local_depth; i ++) {
            current_iseq = current_iseq.parent_iseq!;
        }

        return current_iseq.local_table.find_or_throw(name, depth + this.local_depth);
    }

    private location_to_source_location(location: Location | null): SourceLocation | null {
        if (!location) return null;

        const start_coords = this.offset_to_coords(location.startOffset);
        const end_coords = this.offset_to_coords(location.startOffset + location.length);
        if (!start_coords || !end_coords) return null;

        return this.coords_to_source_location(start_coords, end_coords);
    }

    private offset_to_coords(offset: number | null): { line: number, column: number } | null {
        if (offset === null) return null;
        if (offset === 0) return { line: 1, column: 0 };

        let last_line_offset = 0;

        for (let i = 0; i < this.line_offsets.length; i ++) {
            if (offset >= last_line_offset && offset <= this.line_offsets[i]) {
                return { line: i, column: offset - last_line_offset };
            }

            last_line_offset = this.line_offsets[i];
        }

        if (offset <= this.source.length) {
            return { line: this.line_offsets.length, column: offset - last_line_offset };
        }

        return null;
    }

    private coords_to_source_location(start_coords: { line: number, column: number } | null, end_coords: { line: number, column: number } | null): SourceLocation | null {
        if (!start_coords || !end_coords) return null

        return {
            start_line: start_coords.line,
            start_column: start_coords.column,
            end_line: end_coords.line,
            end_column: end_coords.column,
        }
    }

    private locations_to_source_location(start_location: Location | null, end_location: Location | null): SourceLocation | null {
        if (!start_location || !end_location) return null;

        const start_coords = this.offset_to_coords(start_location.startOffset);
        const end_coords = this.offset_to_coords(end_location.startOffset + end_location.length);

        return this.coords_to_source_location(start_coords, end_coords);
    }

    private get line_offsets(): number[] {
        if (this.line_offsets_) {
            return this.line_offsets_;
        }

        const line_offsets = [0];
        let last_offset = -1;

        while (true) {
            last_offset = this.source.indexOf("\n", last_offset + 1);

            if (last_offset > -1) {
                line_offsets.push(last_offset);
            } else {
                break;
            }
        }

        this.line_offsets_ = line_offsets;
        return this.line_offsets_;
    }

    private with_used<T>(used: boolean, cb: () => T): T {
        this.used_stack.push(used);

        try {
            return cb();
        } finally {
            this.used_stack.pop();
        }
    }

    private get used(): boolean {
        return this.used_stack[this.used_stack.length - 1];
    }

    private capture(cb: () => void): InstructionList {
        const dummy_iseq = new InstructionSequence(this.iseq.name, this.iseq.file, this.iseq.absolute_path, this.iseq.location, this.iseq.type, this.iseq.lexical_scope, this.iseq.parent_iseq, this.iseq.options);
        this.with_child_iseq(dummy_iseq, cb);
        return dummy_iseq;
    }
}
