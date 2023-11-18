// This represents a set of options that can be passed to the compiler to
// control how it compiles the code. It mirrors the options that can be
// passed to RubyVM::InstructionSequence.compile, except it only includes
// options that actually change the behavior.
export class Options {
    private _frozen_string_literal: boolean;
    private _inline_const_cache: boolean;
    private _operands_unification: boolean;
    private _peephole_optimization:boolean;
    private _specialized_instruction: boolean;
    private _tailcall_optimization: boolean;

    constructor(
      frozen_string_literal: boolean = false,
      inline_const_cache: boolean = true,
      operands_unification: boolean = true,
      peephole_optimization:boolean = true,
      specialized_instruction: boolean = true,
      tailcall_optimization: boolean = false
    ) {
      this._frozen_string_literal = frozen_string_literal;
      this._inline_const_cache = inline_const_cache;
      this._operands_unification = operands_unification;
      this._peephole_optimization = peephole_optimization;
      this._specialized_instruction = specialized_instruction;
      this._tailcall_optimization = tailcall_optimization;
    }

    public set frozen_string_literal(val: boolean) {
      this._frozen_string_literal = val;
    }

    public get frozen_string_literal(): boolean {
      return this._frozen_string_literal;
    }

    public get inline_const_cache(): boolean {
      return this._inline_const_cache;
    }

    public get operands_unification(): boolean {
      return this._operands_unification;
    }

    public get peephole_optimization(): boolean {
      return this._peephole_optimization;
    }

    public get specialized_instruction(): boolean {
      return this._specialized_instruction;
    }

    public get tailcall_optimization(): boolean {
      return this._tailcall_optimization;
    }
}
