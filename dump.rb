require "json"

if ARGV[0] == "-h"
  puts <<~END
    Dumps the YARV instruction sequence for a string of Ruby code in JSON format.

    USAGE: dump.rb [-e <code> | <input file>] [<output file>]

    One of <input file> or -e must be provided. If <output file> is not given, writes the
    resulting JSON object to STDOUT.

    -e  A string of Ruby code to dump instructions for.
  END

  exit 0
end

ruby_code, file_path = if ARGV[0] == "-e"
  [ARGV[1], nil].tap do
    ARGV.shift(2)
  end
else
  [File.read(ARGV[0]), ARGV[0]].tap do
    ARGV.shift
  end
end

out_file = if ARGV[0] == nil
  if file_path
    File.open("#{file_path.chomp(".rb")}.json", "w+")
  else
    STDOUT
  end
else
  File.open(ARGV[0], "w+")
end

at_exit do
  out_file.close
end

options = {
  coverage_enabled: false,
  debug_frozen_string_literal: false,
  frozen_string_literal: false,
  inline_const_cache: true,
  instructions_unification: true,
  operands_unification: true,
  peephole_optimization: true,
  specialized_instruction: true,
  stack_caching: true,
  tailcall_optimization: false,
  trace_instruction: false
}

insns = RubyVM::InstructionSequence.compile(ruby_code, **options)
out_file.puts(JSON.pretty_generate(insns.to_a))
