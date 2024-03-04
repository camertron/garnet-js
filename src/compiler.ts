import { ParseResult } from "@ruby/prism/src/deserialize";
import { MethodCallData, BlockCallData, CallDataFlag } from "./call_data";
import { CatchBreak, InstructionSequence, Label, CatchTableStack, CatchNext } from "./instruction_sequence";
import { CompilerOptions } from "./compiler_options";
import {
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
    CaseNode,
    ClassNode,
    ClassVariableReadNode,
    ClassVariableWriteNode,
    ConstantPathNode,
    ConstantPathWriteNode,
    ConstantReadNode,
    ConstantWriteNode,
    DefNode,
    DefinedNode,
    ElseNode,
    EmbeddedStatementsNode,
    EnsureNode,
    FalseNode,
    FloatNode,
    ForwardingArgumentsNode,
    ForwardingParameterNode,
    ForwardingSuperNode,
    GlobalVariableOrWriteNode,
    GlobalVariableReadNode,
    GlobalVariableWriteNode,
    HashNode,
    IfNode,
    IndexOperatorWriteNode,
    IndexOrWriteNode,
    InstanceVariableOperatorWriteNode,
    InstanceVariableOrWriteNode,
    InstanceVariableReadNode,
    InstanceVariableTargetNode,
    InstanceVariableWriteNode,
    IntegerNode,
    InterpolatedRegularExpressionNode,
    InterpolatedStringNode,
    InterpolatedSymbolNode,
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
    ModuleNode,
    MultiWriteNode,
    NextNode,
    NilNode,
    Node,
    NumberedParametersNode,
    NumberedReferenceReadNode,
    OptionalKeywordParameterNode,
    OptionalParameterNode,
    OrNode,
    ParametersNode,
    ParenthesesNode,
    ProgramNode,
    RangeNode,
    RegularExpressionNode,
    RequiredKeywordParameterNode,
    RequiredParameterNode,
    RescueNode,
    RestParameterNode,
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
    WhenNode,
    WhileNode,
    XStringNode,
    YieldNode
} from "@ruby/prism/src/nodes";
import { Visitor } from "@ruby/prism/src/visitor";
import { Lookup } from "./local_table";
import { ObjectClass, Qnil, Qtrue } from "./runtime";
import { DefineClassFlags } from "./insns/defineclass";
import { SpecialObjectType } from "./insns/putspecialobject";
import { ExpandArrayFlag } from "./insns/expandarray";
import { Regexp } from "./runtime/regexp";
import { DefinedType } from "./insns/defined";
import { GetSpecialType } from "./insns/getspecial";
import { SyntaxError } from "./errors";
import { ThrowType } from "./insns/throw";
import { String } from "./runtime/string";

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

export class Compiler extends Visitor {
    private compiler_options: CompilerOptions;
    private source: string;
    private path: string;
    private iseq: InstructionSequence;
    private line_offsets_: number[];
    private local_depth: number;
    private local_catch_table_stack: CatchTableStack;
    private current_line: number;
    private line_offset: number;  // offset to add to all line numbers, used by class_eval and friends
    private used_stack: boolean[];

    public static parse: (code: string) => ParseResult;

    constructor(source: string, path: string, line: number, compiler_options?: CompilerOptions) {
        super();

        this.source = source;
        this.path = path;
        this.compiler_options = compiler_options || new CompilerOptions();
        this.local_depth = 0;
        this.local_catch_table_stack = new CatchTableStack();
        this.line_offset = line;
        this.used_stack = [];
    }

    static compile(source: string, path: string, ast: any, line_offset: number = 0, compiler_options?: CompilerOptions): InstructionSequence {
        const compiler = new Compiler(source, path, line_offset, compiler_options);

        return compiler.with_used<InstructionSequence>(true, () => {
            return compiler.visitProgramNode(ast.value);
        })
    }

    static compile_string(source: string, path: string, line_offset: number = 0, compiler_options?: CompilerOptions) {
        const ast = Compiler.parse(source);
        return this.compile(source, path, ast, line_offset, compiler_options);
    }

    visit(node: Node) {
        let line = this.start_line_for_loc(node.location)

        if (line && line != this.current_line) {
            this.iseq.push(line + this.line_offset);
            this.current_line = line;
        }

        if (Object.getOwnPropertyNames(Compiler.prototype).indexOf(`visit${node.constructor.name}`) === -1) {
            throw new Error(`I don't know how to handle ${node.constructor.name} nodes yet, please help me!`);
        }

        super.visit(node);
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
        const top_iseq = new InstructionSequence("<main>", this.path, this.start_line_for_loc(node.location)!, "top", null, this.compiler_options);

        node.locals.forEach((local: string) => {
            top_iseq.local_table.plain(local);
        });

        this.with_child_iseq(top_iseq, () => {
            if (node.statements == null) {
                this.iseq.putnil()
            } else {
                const statements = [...node.statements.body];

                // We need to do some preprocessing here to grab up all of the BEGIN{}
                // nodes. We could do this instead by manipulating our linked list of
                // instructions, but it's easier to just do it here.
                const preexes: any[] = [];
                let index = 0;

                while (index < statements.length) {
                    const statement = statements[index];
                    if (statement.constructor.name == "PreExecutionNode") {
                        preexes.push(statements[index]);
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

        top_iseq.compile()
        return top_iseq;
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
        this.visitAll(node.arguments_);
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

        let argc = 0;
        let flags = 0;
        let kw_arg: string[] = [];

        if (node.arguments_) {
            argc = node.arguments_.arguments_.length;
            this.with_used(true, () => this.visit(node.arguments_!));

            node.arguments_.arguments_.forEach((argument) => {
                switch (argument.constructor.name) {
                    case "SplatNode":
                        flags |= CallDataFlag.ARGS_SPLAT;
                        break;

                    case "ForwardingArgumentsNode":
                        flags |= CallDataFlag.ARGS_SPLAT;
                        flags |= CallDataFlag.ARGS_BLOCKARG;
                        break;

                    case "KeywordHashNode":
                        argc --;

                        (argument as KeywordHashNode).elements.forEach((element) => {
                            switch (element.constructor.name) {
                                case "AssocNode":
                                    flags |= CallDataFlag.KWARG;
                                    const assoc_node = element as AssocNode;
                                    kw_arg.push((assoc_node.key as SymbolNode).unescaped);
                                    break;

                                case "AssocSplatNode":
                                    flags |= CallDataFlag.KW_SPLAT;
                                    kw_arg.push("**");
                                    break;
                            }
                        });
                        break;
                }
            });
        }

        let block_iseq = null;

        switch (node.block?.constructor.name) {
            case "BlockNode":
                flags |= CallDataFlag.ARGS_BLOCKARG;
                block_iseq = this.with_used(true, () => this.visitBlockNode(node.block as BlockNode));
                break;
            case "BlockArgumentNode":
                flags |= CallDataFlag.ARGS_BLOCKARG;
                this.with_used(true, () => this.visit(node.block!));
                break;
        }

        if (flags == 0 && !block_iseq) {
            flags |= CallDataFlag.ARGS_SIMPLE;
        }

        if (!node.receiver) {
            flags |= CallDataFlag.FCALL;
        }

        if (node.isVariableCall()) {
            flags |= CallDataFlag.VCALL;
        }

        this.iseq.send(MethodCallData.create(node.name, argc, flags, kw_arg), block_iseq);

        if (safe_label) {
            this.iseq.jump(safe_label);
            this.iseq.push(safe_label);
        }

        if (!this.used) {
            this.iseq.pop();
        }
    }

    override visitBlockNode(node: BlockNode): InstructionSequence {
        return this.with_child_iseq(this.iseq.block_child_iseq(this.start_line_for_loc(node.location)!), () => {
            const begin_label = this.iseq.label();
            const end_label = this.iseq.label();

            // contrary to the type signature, node.locals can be undefined
            if (node.locals) {
                node.locals.forEach((local: string) => {
                    this.iseq.local_table.plain(local);
                });
            }

            if (node.parameters) {
                this.with_used(true, () => this.visit(node.parameters!));
            }

            this.iseq.push(begin_label);

            if (node.body) {
                this.with_used(true, () => this.visit(node.body!));
            } else {
                this.iseq.putnil();
            }

            this.iseq.push(end_label);
            this.iseq.leave();

            this.iseq.catch_table.catch_next(begin_label, end_label, end_label, 0);
        });
    }

    override visitIntegerNode(node: IntegerNode) {
        if (this.used) {
            this.iseq.putobject({ type: "Integer", value: node.value });
        }
    }

    override visitFloatNode(node: FloatNode) {
        if (this.used) {
            const floatVal = this.text_for_loc(node.location);
            this.iseq.putobject({ type: "Float", value: parseFloat(floatVal) });
        }
    }

    override visitStringNode(node: StringNode) {
        if (!this.used) return

        if (node.isFrozen()) {
            this.iseq.putobject({type: "String", value: node.unescaped});
        } else {
            this.iseq.putstring(node.unescaped);
        }
    }

    override visitLocalVariableReadNode(node: LocalVariableReadNode) {
        const lookup = this.find_local_or_throw(node.name, node.depth + this.local_depth);

        if (this.used) {
            this.iseq.getlocal(lookup.index, lookup.depth);
        }
    }

    override visitLocalVariableWriteNode(node: LocalVariableWriteNode) {
        this.with_used(true, () => this.visit(node.value));

        if (this.used) {
            this.iseq.dup();
        }

        const lookup = this.find_local_or_throw(node.name, node.depth + this.local_depth);
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitLocalVariableAndWriteNode(node: LocalVariableAndWriteNode) {
        const label = this.iseq.label();

        const lookup = this.find_local_or_throw(node.name, node.depth + this.local_depth);
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

        const lookup = this.find_local_or_throw!(node.name, node.depth + this.local_depth);
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
        const lookup = this.find_local_or_throw(node.name, node.depth + this.local_depth);
        this.iseq.getlocal(lookup.index, lookup.depth);
        this.with_used(true, () => this.visit(node.value));
        this.iseq.send(MethodCallData.create(node.operator, 1), null);
        if (this.used) this.iseq.dup();
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitLocalVariableTargetNode(node: LocalVariableTargetNode) {
        const lookup = this.find_local_or_throw(node.name, node.depth + this.local_depth);
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    override visitMultiWriteNode(node: MultiWriteNode) {
        this.with_used(true, () => this.visit(node.value));
        if (this.used) this.iseq.dup();

        if (node.lefts.length > 0) {
            this.iseq.expandarray(node.lefts.length, node.rest ? ExpandArrayFlag.SPLAT_FLAG : 0);
            this.with_used(true, () => this.visitAll(node.lefts));
        }

        let flags = 0;

        if (node.rest) {
            flags |= ExpandArrayFlag.SPLAT_FLAG;
        }

        if (node.rights.length > 0) {
            flags |= ExpandArrayFlag.POSTARG_FLAG;
        }

        if (node.rights.length > 0) {
            this.iseq.expandarray(node.rights.length, flags);
        }

        if (node.rest) {
            const splat_expr = (node.rest as SplatNode).expression;

            if (splat_expr) {
                this.with_used(true, () => this.visit(splat_expr));
            }
        }

        this.with_used(true, () => this.visitAll(node.rights));
    }

    override visitArrayNode(node: ArrayNode) {
        this.visitAll(node.elements);

        if (this.used) {
            this.iseq.newarray(node.elements.length);
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
                    const call_data = MethodCallData.create("hash_merge_kwd", 2)
                    this.iseq.send(call_data, null);
                }
            } else {
                this.visit(element);
                length += 2;
            }
        });

        if (this.used) {
            this.iseq.newhash(node.elements.length * 2)
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
        const name = node.name;
        const method_iseq = this.iseq.method_child_iseq(name, this.start_line_for_loc(node.location)!);

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

        if (node.receiver) {
            this.with_used(true, () => this.visit(node.receiver!));
            this.iseq.definesmethod(name, method_iseq)
        } else {
            this.iseq.definemethod(name, method_iseq);
        }

        if (this.used) {
            this.iseq.putobject({type: "Symbol", value: name});
        }
    }

    // (required, optional = nil, *rest, post, keywords:, **keywordRest, &block)
    override visitParametersNode(node: ParametersNode) {
        this.with_used(true, () => this.visitAll(node.requireds));
        this.iseq.argument_options.lead_num = node.requireds.length;
        this.with_used(true, () => this.visitAll(node.optionals));
        this.iseq.argument_size += node.requireds.length + node.optionals.length;

        if (node.rest) {
            this.iseq.argument_options.rest_start = this.iseq.argument_size
            this.with_used(true, () => this.visit(node.rest!));
            this.iseq.argument_size ++;
        }

        // posts are of type RequiredParameterNode
        if (node.posts) {
            this.iseq.argument_options.post_start = this.iseq.argument_size;
            this.with_used(true, () => this.visitAll(node.posts));
            this.iseq.argument_size += node.posts.length;
            this.iseq.argument_options.post_num = node.posts.length;
        }

        if (node.keywords) {
            this.iseq.argument_options.keyword = [];
            this.iseq.argument_options.keyword_bits_index = this.iseq.local_table.keyword_bits();
            this.with_used(true, () => this.visitAll(node.keywords));
            this.iseq.argument_size += this.iseq.argument_options.keyword.length;
        }

        if (node.keywordRest) {
            this.iseq.argument_options.keyword_rest_start = this.iseq.argument_size;
            this.with_used(true, () => this.visit(node.keywordRest!));
        }

        if (node.block) {
            this.iseq.argument_options.block_start = this.iseq.argument_size;
            this.with_used(true, () => this.visit(node.block!));
            this.iseq.argument_size ++;
        }
    }

    override visitKeywordRestParameterNode(node: KeywordRestParameterNode): void {
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

    override visitForwardingArgumentsNode(node: ForwardingArgumentsNode): void {
        let current_iseq: InstructionSequence | null = this.iseq;
        let depth = 0;

        while (current_iseq && !current_iseq.local_table.find("...")) {
          current_iseq = current_iseq.parent_iseq;
          depth ++;
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
        // no-op
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
        // no-op
    }

    override visitSplatNode(node: SplatNode) {
        if (node.expression) {
            this.visit(node.expression);
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

        if (node.consequent) {
            this.visit(node.consequent);
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

        if (node.consequent) {
            this.visit(node.consequent);
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
        this.visit(node.right);
        this.iseq.push(label);
    }

    override visitOrNode(node: OrNode) {
        const label = this.iseq.label();

        this.with_used(true, () => this.visit(node.left));
        if (this.used) this.iseq.dup();
        this.iseq.branchif(label);
        if (this.used) this.iseq.pop()
        this.visit(node.right);
        this.iseq.push(label);
    }

    override visitClassNode(node: ClassNode) {
        const class_iseq = this.iseq.class_child_iseq(node.name, this.start_line_for_loc(node.location)!);
        this.with_child_iseq(class_iseq, () => {
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
        const module_iseq = this.iseq.module_child_iseq(node.name, this.start_line_for_loc(node.location)!);
        this.with_child_iseq(module_iseq, () => {
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

    override visitSymbolNode(node: SymbolNode) {
        if (this.used) {
            this.iseq.putobject({type: "Symbol", value: node.unescaped});
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

    override visitBeginNode(node: BeginNode) {
        const begin_label = this.iseq.label();
        const end_label = this.iseq.label();
        const exit_label = this.iseq.label();
        const else_label = this.iseq.label();

        this.iseq.push(begin_label);

        if (node.statements) {
            const [first_statements, last_statement] = this.split_rest_last(node.statements.body);
            this.with_used(true, () => this.visitAll(first_statements));
            this.visit(last_statement);

            if (node.elseClause) {
                this.iseq.jump(else_label);
            } else {
                this.iseq.jump(exit_label);
            }
        }

        this.iseq.push(end_label);

        // Rescue clauses execute in a so-called "transparent" scope, which we and MRI accomplish
        // by pushing a stack frame. Locals inside this frame are actually tracked in the parent
        // frame, so local depth needs to be incremented and added to the depth calculated by Prism.
        // Not all Ruby implementations use a stack frame for rescue clauses, so Prism doesn't
        // increase the depth for rescues. See https://github.com/ruby/prism/pull/1908 for more info.
        this.local_depth ++;

        if (node.rescueClause) {
            const rescue_iseq = this.iseq.rescue_child_iseq(this.start_line_for_loc(node.location)!);

            this.with_child_iseq(rescue_iseq, () => {
                this.with_used(true, () => this.visit(node.rescueClause!));
            });

            this.iseq.catch_table.catch_rescue(
                rescue_iseq, begin_label, end_label, exit_label, rescue_iseq.local_table.size()
            );
        }

        this.local_depth --;

        if (node.elseClause) {
            this.iseq.push(else_label);
            this.visit(node.elseClause);
        }

        this.iseq.push(exit_label);

        if (node.ensureClause) {
            this.with_used(false, () => this.visit(node.ensureClause!));
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

        if (node.consequent) {
            this.visitRescueNode(node.consequent);
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
        this.with_used(true, () => this.visitAll(node.parts));
        this.iseq.dup();
        this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
        this.iseq.anytostring()
        this.iseq.concatstrings(node.parts.length);

        if (!this.used) {
            this.iseq.pop()
        }
    }

    override visitInterpolatedSymbolNode(node: InterpolatedSymbolNode) {
        this.with_used(true, () => this.visitAll(node.parts));
        this.iseq.dup();
        this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
        this.iseq.anytostring();
        this.iseq.concatstrings(node.parts.length);
        this.iseq.intern();
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
        if (node.parent == null) {
            this.iseq.putobject({type: "RValue", value: ObjectClass});
            this.iseq.putobject({type: "TrueClass", value: true});
        } else {
            this.visit(node.parent);
            this.iseq.putobject({type: "FalseClass", value: false});
        }

        this.iseq.getconstant((node.child as ConstantReadNode).name);
    }

    override visitConstantPathWriteNode(node: ConstantPathWriteNode) {
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
        this.iseq.setconstant((node.target.child as ConstantReadNode).name);
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
        this.iseq.send(MethodCallData.create(node.operator, 1), null);

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

    override visitCaseNode(node: CaseNode) {
        if (node.predicate) {
            this.with_used(true, () => this.visit(node.predicate!));
        }

        const done_label = this.iseq.label();
        const labels: Label[] = [];

        (node.conditions as WhenNode[]).forEach((clause) => {
            const label = this.iseq.label();

            clause.conditions.forEach((condition) => {
                this.with_used(true, () => this.visit(condition));
                this.iseq.topn(1);
                this.iseq.send(MethodCallData.create("===", 1, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE), null);
                this.iseq.branchif(label);
            });

            labels.push(label);
        });

        this.iseq.pop();

        if (node.consequent) {
            this.visit(node.consequent);
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

    override visitKeywordHashNode(node: KeywordHashNode) {
        // The CallData object maintains information about the kwargs
        // a method was called with, meaning we don't have to visit the
        // keys here, just the values. The send instruction will sort
        // everything out.
        for (const element of node.elements) {
            const value = (element as AssocNode | AssocSplatNode).value;
            if (value) this.visit(value);
        }

        // if (node.elements.length > 0) {
        //     for (const element of node.elements) {
        //         if (element.constructor.name === "AssocSplatNode") {
        //             const splat_node = element as AssocSplatNode;
        //             if (splat_node.value) {
        //                 this.with_used(true, () => this.visit(splat_node.value!));
        //             }
        //         } else if (element.constructor.name === "AssocNode") {
        //             const assoc_node = element as AssocNode;
        //             if (assoc_node.value) {
        //                 // The CallData object maintains information about the kwargs
        //                 // a method was called with, meaning we don't have to visit the
        //                 // keys here, just the values. The send instruction will sort
        //                 // everything out.
        //                 this.with_used(true, () => this.visit(assoc_node.value!));
        //             }
        //         }
        //     }
        // }
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

        if (node.arguments_) {
            this.with_used(true, () => this.visit(node.arguments_!));
            argc = node.arguments_.arguments_.length;
        }

        this.iseq.invokeblock(new BlockCallData(argc, CallDataFlag.ARGS_SIMPLE, null));
        if (!this.used) this.iseq.pop();
    }

    override visitSingletonClassNode(node: SingletonClassNode) {
        this.with_used(true, () => this.visit(node.expression));
        this.iseq.putnil()

        const singleton_iseq = this.iseq.singleton_class_child_iseq(this.start_line_for_loc(node.location)!);

        this.with_child_iseq(singleton_iseq, () => {
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

    override visitRegularExpressionNode(node: RegularExpressionNode) {
        if (this.used) {
            // @TODO: handle options
            this.iseq.putobject({type: "RValue", value: Regexp.new(node.unescaped, "")})
        }
    }

    override visitInterpolatedRegularExpressionNode(node: InterpolatedRegularExpressionNode) {
        this.with_used(true, () => this.visitAll(node.parts));
        this.iseq.dup();
        this.iseq.objtostring(MethodCallData.create("to_s", 0, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE));
        this.iseq.anytostring();

        // @TODO: handle options
        this.iseq.toregexp("", node.parts.length);
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

            // skip past rescue frames, which aren't actually frames
            while (iseq.type === "rescue") {
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
            // throw if inside a block iseq
            if (this.iseq.type === "block") {
                this.iseq.throw(ThrowType.BREAK);
                return;
            }
        }

        throw new SyntaxError("Invalid break");
    }

    override visitLambdaNode(node: LambdaNode) {
        const lambda_iseq = this.iseq.block_child_iseq(this.start_line_for_loc(node.location)!);

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

        // remove duped instruction, since we won't be returning it
        this.iseq.pop();

        this.with_used(true, () => this.visit(node.value));

        // copy the new value above our args so it can be returned
        this.iseq.setn(2 + arg_size);

        // +1 for assigned value, the last argument
        // this.iseq.opt_aset(MethodCallData.create("[]=", arg_size + 1, CallDataFlag.FCALL, null));
        this.iseq.send(MethodCallData.create("[]=", arg_size + 1, CallDataFlag.FCALL, null), null);
        // this.iseq.pop();
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
        if (node.arguments_) {
            this.with_used(true, () => this.visit(node.arguments_!));
        }

        let flags = CallDataFlag.FCALL | CallDataFlag.SUPER | CallDataFlag.ZSUPER;
        let block_iseq = null;

        if (node.block) {
          block_iseq = this.with_used<InstructionSequence>(true, () => this.visitBlockNode(node.block as BlockNode));
        } else {
          flags |= CallDataFlag.ARGS_SIMPLE;
        }

        this.iseq.putself();
        this.iseq.invokesuper(MethodCallData.create("super", node.arguments_?.arguments_.length || 0, flags), block_iseq);
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
        this.iseq.putobject({type: "String", value: node.unescaped});
        this.iseq.send(MethodCallData.create("`", 1, CallDataFlag.FCALL | CallDataFlag.ARGS_SIMPLE), null);
        if (!this.used) this.iseq.pop()
    }

    override visitNumberedReferenceReadNode(node: NumberedReferenceReadNode) {
        if (this.used) {
            this.iseq.getspecial(GetSpecialType.BACKREF, node.number << 1);
        }
    }

    override visitSourceFileNode(_node: SourceFileNode) {
        if (this.used) {
            this.iseq.putstring(this.path);
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
            this.iseq.send(MethodCallData.create(node.operator, 1), null);
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
            this.iseq.send(MethodCallData.create(node.operator, 1), null);

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

        const value = node.value;
        const type = value.constructor.name;

        if (type === "CallNode") {
            this.iseq.putself();
            this.iseq.defined(DefinedType.FUNC, (value as CallNode).name, String.new("method"));
        } else if (type === "ClassVariableReadNode") {
            this.iseq.defined(DefinedType.CVAR, (value as ClassVariableReadNode).name, String.new("class variable"));
        } else if (type === "ConstantPathNode") {
            const val = value as ConstantPathNode;

            if (val.parent == null) {
                this.iseq.putobject({type: "RValue", value: ObjectClass});
            } else {
                this.with_used(true, () => this.visit(val.parent!));
            }

            this.iseq.defined(DefinedType.CONST_FROM, (val.child as ConstantReadNode).name, String.new("constant"));
        } else if (type === "ConstantReadNode") {
            this.iseq.defined(DefinedType.CONST, (value as ConstantReadNode).name, String.new("constant"));
        } else if (type === "FalseNode") {
            this.iseq.putobject({type: "RValue", value: String.new("true")});
        } else if (type === "ForwardingSuperNode") {
            this.iseq.putself();
            this.iseq.defined(DefinedType.ZSUPER, "", String.new("super"));
        } else if (type === "GlobalVariableReadNode") {
            this.iseq.defined(DefinedType.GVAR, (value as GlobalVariableReadNode).name, String.new("global-variable"));
        } else if (type === "LocalVariableReadNode") {
            this.iseq.putobject({type: "RValue", value: String.new("local-variable")});
        } else if (type === "LocalVariableWriteNode") {
            this.iseq.putobject({type: "RValue", value: String.new("assignment")});
        } else if (type === "NilNode") {
            this.iseq.putobject({type: "NilClass", value: Qnil});
        } else if (type === "SelfNode") {
            this.iseq.putobject({type: "RValue", value: String.new("self")});
        } else if (type === "TrueNode") {
            this.iseq.putobject({type: "RValue", value: String.new("true")});
        } else if (type === "YieldNode") {
            this.iseq.putnil();
            this.iseq.defined(DefinedType.YIELD, "", String.new("yield"));
        } else {
            this.iseq.putobject({type: "RValue", value: String.new("expression")});
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

        return current_iseq.local_table.find_or_throw(name, depth);
    }

    private text_for_loc(location: Location): string {
        return this.source.slice(
            location.startOffset,
            location.startOffset + location.length
        );
    }

    private start_line_for_loc(location: Location): number | null {
        let last_line_offset = 0;

        for (let i = 0; i < this.line_offsets.length; i ++) {
            if (location.startOffset > last_line_offset && location.startOffset <= this.line_offsets[i]) {
                return i;
            }

            last_line_offset = this.line_offsets[i];
        }

        return null;
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
}