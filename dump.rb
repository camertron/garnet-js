require "bundler/inline"

gemfile do
  source "https://rubygems.org"
  gem "pry-byebug"
end

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
iseq = insns.to_a

def object_meta(object)
  value = case object
  in String, Integer, TrueClass, FalseClass, NilClass
    object
  in Symbol
    object.to_s
  else
    object
  end

  { value: value, type: object.class.name }
end

def process_iseq(iseq)
  insns = iseq.last.map do |insn|
    case insn
    in :putobject, object
      [:putobject, object_meta(object)]
    in :duparray, array
      [:duparray, array.map { |element| object_meta(element) }]
    in :definemethod, name, iseq
      [:definemethod, name, process_iseq(iseq)]
    in :defineclass, name, iseq, flags
      [:defineclass, name, process_iseq(iseq), flags]
    in :send, call_data, block_iseq
      [:send, call_data, process_iseq(block_iseq)]
    else
      insn
    end
  end

  [*iseq[0..-2], insns]
end

out_file.puts(JSON.pretty_generate(process_iseq(iseq)))
