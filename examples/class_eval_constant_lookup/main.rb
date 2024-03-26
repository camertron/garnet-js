TOPLEVEL_CLASS_EVAL = ->(__klass__, __path__) do
  __klass__.class_eval(::File.read(__path__), __path__)
end

klass = Class.new
klass.extend(Module.new do
  def method_with_block
    method2_with_block do
      yield
    end
  end

  def method2_with_block
    yield
  end
end)

TOPLEVEL_CLASS_EVAL.call(klass, "examples/class_eval_constant_lookup/script.rb")
