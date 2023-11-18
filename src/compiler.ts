import { ParseResult } from "@ruby/prism/types/deserialize";
import CallData, { CallDataFlag } from "./call_data";
import { InstructionSequence } from "./instruction_sequence";
import { Options } from "./options";
import { AndNode, ArgumentsNode, ArrayNode, AssocNode, BlockNode, BlockParametersNode, CallNode, ClassNode, ConstantReadNode, DefNode, ElseNode, HashNode, IfNode, InstanceVariableReadNode, InstanceVariableWriteNode, IntegerNode, KeywordHashNode, LocalVariableReadNode, LocalVariableWriteNode, Location, ModuleNode, Node, OrNode, ParametersNode, ProgramNode, RequiredParameterNode, ReturnNode, StatementsNode, StringNode, SymbolNode } from "@ruby/prism/types/nodes";
import { Lookup } from "./local_table";
import { ObjectClass, Qnil } from "./runtime";
import { DefineClassFlags } from "./insns/defineclass";
import { SpecialObjectType } from "./insns/putspecialobject";

export class Compiler {
    private options: Options;
    private source: string;
    private iseq: InstructionSequence;
    private line_offsets_: number[];

    public static parse: (code: string) => ParseResult;

    constructor(source: string, options?: Options) {
        this.source = source;
        this.options = options || new Options();
    }

    static compile(source: string, ast: any, options?: Options): InstructionSequence {
        const compiler = new Compiler(source, options);
        return compiler.visit_program_node(ast.value, true);
    }

    static compile_string(source: string, options?: Options) {
        const ast = Compiler.parse(source);
        return this.compile(source, ast, options);
    }

    private visit(node: Node, used: boolean) {
        switch (node.constructor.name) {
            case "ProgramNode":
                this.visit_program_node(node as ProgramNode, used);
                break;

            case "StatementsNode":
                this.visit_statements_node(node as StatementsNode, used);
                break;

            case "ArgumentsNode":
                this.visit_arguments_node(node as ArgumentsNode, used);
                break;

            case "CallNode":
                this.visit_call_node(node as CallNode, used);
                break;

            case "IntegerNode":
                this.visit_integer_node(node as IntegerNode, used);
                break;

            case "StringNode":
                this.visit_string_node(node as StringNode, used);
                break;

            case "LocalVariableReadNode":
                this.visit_local_variable_read_node(node as LocalVariableReadNode, used);
                break;

            case "LocalVariableWriteNode":
                this.visit_local_variable_write_node(node as LocalVariableWriteNode, used);
                break;

            case "ArrayNode":
                this.visit_array_node(node as ArrayNode, used);
                break;

            case "HashNode":
                this.visit_hash_node(node as HashNode, used);
                break;

            case "AssocNode":
                this.visit_assoc_node(node as AssocNode, used);
                break;

            case "DefNode":
                this.visit_def_node(node as DefNode, used);
                break;

            case "ParametersNode":
                this.visit_parameters_node(node as ParametersNode, used);
                break;

            case "RequiredParameterNode":
                this.visit_required_parameter_node(node as RequiredParameterNode, used);
                break;

            case "IfNode":
                this.visit_if_node(node as IfNode, used);
                break;

            case "ElseNode":
                this.visit_else_node(node as ElseNode, used);
                break;

            case "AndNode":
                this.visit_and_node(node as AndNode, used);
                break;

            case "OrNode":
                this.visit_or_node(node as OrNode, used);
                break;

            case "ClassNode":
                this.visit_class_node(node as ClassNode, used);
                break;

            case "ModuleNode":
                this.visit_module_node(node as ModuleNode, used);
                break;

            case "ConstantReadNode":
                this.visit_constant_read_node(node as ConstantReadNode, used);
                break;

            case "SymbolNode":
                this.visit_symbol_node(node as SymbolNode, used);
                break;

            case "BlockParametersNode":
                this.visit_block_parameters_node(node as BlockParametersNode, used);
                break;

            case "InstanceVariableWriteNode":
                this.visit_instance_variable_write_node(node as InstanceVariableWriteNode, used);
                break;

            case "InstanceVariableReadNode":
                this.visit_instance_variable_read_node(node as InstanceVariableReadNode, used);
                break;

            case "ReturnNode":
                this.visit_return_node(node as ReturnNode, used);
                break;

            default:
                throw new Error(`I can't handle ${node.constructor.name}s yet, help me!`);
        }
    }

    private visit_all(nodes: any[], used: boolean) {
        nodes.forEach((node: any) => {
            this.visit(node, used);
        });
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

    private visit_program_node(node: ProgramNode, _used: boolean): InstructionSequence {
        const top_iseq = new InstructionSequence("<compiled>", "<compiled>", this.start_line_for_loc(node.location)!, "top", null, this.options);

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

                this.visit_all(preexes, false);

                if (statements.length == 0) {
                    this.iseq.putnil();
                } else {
                    const [first_statements, last_statement] = this.split_rest_last(statements)

                    this.visit_all(first_statements, false);
                    this.visit(last_statement, true);
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

    private visit_statements_node(node: StatementsNode, used: boolean) {
        const [statements, last_statement] = this.split_rest_last(node.body as any[])

        this.visit_all(statements, false);
        this.visit(last_statement, used);
    }

    private visit_arguments_node(node: ArgumentsNode, used: boolean) {
        this.visit_all(node.arguments_, used);
    }

    private visit_call_node(node: CallNode, used: boolean) {
        if (node.receiver) {
            this.visit(node.receiver, true);
        } else {
            this.iseq.putself()
        }

        let safe_label = null;

        if (node.isSafeNavigation()) {
            safe_label = this.iseq.label()
            this.iseq.dup();
            this.iseq.branchnil(safe_label);
        }

        let argc = 0;
        let flags = 0;
        let kw_arg = null;

        if (node.arguments_) {
            argc = node.arguments_.arguments_.length;
            this.visit(node.arguments_, true);

            node.arguments_.arguments_.forEach((argument) => {
                switch (argument.constructor.name) {
                    case "ForwardingArgumentsNode":
                        flags |= CallDataFlag.ARGS_SPLAT;
                        flags |= CallDataFlag.ARGS_BLOCKARG;
                        break;

                    case "KeywordHashNode":
                        flags |= CallDataFlag.KWARG;
                        kw_arg = (argument as KeywordHashNode).elements.map((element) => {
                            return ((element as AssocNode).key as SymbolNode).unescaped;
                        });
                        break;
                }
            });
        }

        let block_iseq = null;

        switch (node.block?.constructor.name) {
            case "BlockNode":
                block_iseq = this.visit_block_node(node.block as BlockNode, true);
                break;
            case "BlockArgumentNode":
                flags |= CallDataFlag.ARGS_BLOCKARG;
                this.visit(node.block, true);
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

        this.iseq.send(CallData.create(node.name, argc, flags, kw_arg), block_iseq);

        if (safe_label) {
            this.iseq.jump(safe_label);
            this.iseq.push(safe_label);
        }

        if (!used) {
            this.iseq.pop()
        }
    }

    private visit_block_node(node: BlockNode, used: boolean): InstructionSequence {
        return this.with_child_iseq(this.iseq.block_child_iseq(this.start_line_for_loc(node.location)!), () => {
            node.locals.forEach((local: string) => {
                this.iseq.local_table.plain(local);
            });

            if (node.parameters) {
                this.visit(node.parameters, true);
            }

            if (node.body) {
                this.visit(node.body, true);
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave();
        });
    }

    private visit_integer_node(node: IntegerNode, used: boolean) {
        if (used) {
            const intVal = this.text_for_loc(node.location);
            this.iseq.putobject({ type: "Integer", value: parseInt(intVal) });
        }
    }

    private visit_string_node(node: StringNode, used: boolean) {
        if (!used) return

        if (node.isFrozen()) {
            this.iseq.putobject({type: "String", value: node.unescaped})
        } else {
            this.iseq.putstring(node.unescaped)
        }
    }

    private visit_local_variable_read_node(node: LocalVariableReadNode, used: boolean) {
        const lookup = this.find_local_or_throw(node.name, node.depth)

        if (used) {
            this.iseq.getlocal(lookup.index, lookup.depth);
        }
    }

    private visit_local_variable_write_node(node: LocalVariableWriteNode, used: boolean) {
        this.visit(node.value, true);

        if (used) {
            this.iseq.dup()
        }

        const lookup = this.find_local_or_throw(node.name, node.depth);
        this.iseq.setlocal(lookup.index, lookup.depth);
    }

    private visit_array_node(node: ArrayNode, used: boolean) {
        this.visit_all(node.elements, used);

        if (used) {
            this.iseq.newarray(node.elements.length);
        }
    }

    private visit_hash_node(node: HashNode, used: boolean) {
        let length = 0;

        node.elements.forEach((element) => {
            if (element.constructor.name == "AssocSplatNode") {
                if (used) {
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

                this.visit(element, used);

                if (used) {
                    const call_data = new CallData("core#hash_merge_kwd", 2, CallDataFlag.ARGS_SIMPLE, null)
                    this.iseq.send(call_data, null);
                }
            } else {
                this.visit(element, used);
                length += 2;
            }
        });

        if (used && length > 0) {
            this.iseq.newhash(node.elements.length * 2)
        }
    }

    private visit_assoc_node(node: AssocNode, used: boolean) {
        this.visit(node.key, used);

        // I don't understand how value could ever be null, but whatevs
        if (node.value) {
            this.visit(node.value, used);
        }
    }

    private visit_def_node(node: DefNode, used: boolean) {
        const name = node.name;
        const method_iseq = this.iseq.method_child_iseq(name, this.start_line_for_loc(node.location)!);

        this.with_child_iseq(method_iseq, () => {
            node.locals.forEach((local) => {
                if (local == "...") {
                    this.iseq.local_table.plain("*")
                    this.iseq.local_table.block("&")
                }

                this.iseq.local_table.plain(local)
            });

            if (node.parameters) {
                this.visit(node.parameters, true)
            }

            if (node.body) {
                this.visit(node.body, true)
            } else {
                this.iseq.putnil();
            }

            this.iseq.leave()
        })

        if (node.receiver) {
            this.visit(node.receiver, true);
            this.iseq.definesmethod(name, method_iseq)
        } else {
            this.iseq.definemethod(name, method_iseq);
        }

        if (used) {
            this.iseq.putobject({type: "Symbol", value: name});
        }
    }

    private visit_parameters_node(node: ParametersNode, _used: boolean) {
        this.visit_all(node.requireds, true);
        this.visit_all(node.optionals, true);
    }

    private visit_required_parameter_node(_node: RequiredParameterNode, _used: boolean) {
        this.iseq.argument_size += 1;
        this.iseq.argument_options.lead_num += 1;
    }

    private visit_if_node(node: IfNode, used: boolean) {
        const body_label = this.iseq.label()
        const else_label = this.iseq.label()
        const done_label = this.iseq.label()

        this.visit(node.predicate, true);

        this.iseq.branchunless(else_label)
        this.iseq.jump(body_label)
        this.iseq.push(body_label)

        if (node.statements) {
            this.visit(node.statements, used);
        } else {
            if (used) this.iseq.putnil();
        }

        this.iseq.jump(done_label);
        if (used) this.iseq.pop();
        this.iseq.push(else_label);

        if (node.consequent) {
            this.visit(node.consequent, used);
        } else {
            if (used) this.iseq.putnil();
        }

        this.iseq.push(done_label);
    }

    private visit_else_node(node: ElseNode, used: boolean) {
        if (node.statements) {
            this.visit(node.statements, used);
        }
    }

    private visit_and_node(node: AndNode, used: boolean) {
        const label = this.iseq.label()

        this.visit(node.left, true);
        if (used) this.iseq.dup();
        this.iseq.branchunless(label)
        if (used) this.iseq.pop();
        this.visit(node.right, used);
        this.iseq.push(label);
    }

    private visit_or_node(node: OrNode, used: boolean) {
        const label = this.iseq.label();

        this.visit(node.left, true);
        if (used) this.iseq.dup();
        this.iseq.branchif(label);
        if (used) this.iseq.pop()
        this.visit(node.right, used);
        this.iseq.push(label);
    }

    private visit_class_node(node: ClassNode, used: boolean) {
        const class_iseq = this.iseq.class_child_iseq(node.name, this.start_line_for_loc(node.location)!);
        this.with_child_iseq(class_iseq, () => {
            if (node.body) {
                this.visit(node.body, true);
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
            this.visit((constant_path as any).parent, true);
        }

        if (node.superclass) {
            flags |= DefineClassFlags.FLAG_HAS_SUPERCLASS;
            this.visit(node.superclass, true);
        } else {
            this.iseq.putnil();
        }

        this.iseq.defineclass(node.name, class_iseq, flags);

        if (!used) {
            this.iseq.pop();
        }
    }

    private visit_module_node(node: ModuleNode, used: boolean) {
        const module_iseq = this.iseq.class_child_iseq(node.name, this.start_line_for_loc(node.location)!);
        this.with_child_iseq(module_iseq, () => {
            if (node.body) {
                this.visit(node.body, true);
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
            this.visit((constant_path as any).parent, true);
        }

        this.iseq.putnil() // superclass
        this.iseq.defineclass(node.name, module_iseq, flags);

        if (!used) {
            this.iseq.pop();
        }
    }

    private visit_constant_read_node(node: ConstantReadNode, used: boolean) {
        this.iseq.putnil();
        this.iseq.putobject({type: "TrueClass", value: true});

        if (used) {
            this.iseq.getconstant(node.name)
        }
    }

    private visit_symbol_node(node: SymbolNode, used: boolean) {
        if (used) {
            this.iseq.putobject({type: "Symbol", value: node.unescaped});
        }
    }

    private visit_block_parameters_node(node: BlockParametersNode, used: boolean) {
        if (node.parameters) {
            this.visit(node.parameters, used);
        }
    }

    private visit_instance_variable_write_node(node: InstanceVariableWriteNode, used: boolean) {
        this.visit(node.value, true);
        if (used) this.iseq.dup();
        this.iseq.setinstancevariable(node.name);
    }

    private visit_instance_variable_read_node(node: InstanceVariableReadNode, used: boolean) {
        if (used) {
            this.iseq.getinstancevariable(node.name);
        }
    }

    private visit_return_node(node: ReturnNode, used: boolean) {
        if (node.arguments_) {
            if (node.arguments_.arguments_.length == 1) {
                this.visit(node.arguments_, true);
            } else if (node.arguments_.arguments_.length > 1) {
                this.visit(node.arguments_, true);
                this.iseq.newarray(node.arguments_.arguments_.length);
            }
        }

        this.iseq.leave();
    }

    private find_local_or_throw(name: string, depth: number): Lookup {
        let current_iseq = this.iseq;

        for (let i = 0; i < depth; i ++) {
            current_iseq = current_iseq.parent_iseq!;
        }

        return current_iseq.local_table.find_or_error(name, depth);
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
            if (location.startOffset >= this.line_offsets[i] && location.startOffset <= last_line_offset) {
                return i + 1;
            }
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
}