def foo(...)
  bar(...)
end

def bar(arg1, arg2, *rest, kwarg1:, kwarg2:, **kwrest, &block)
  puts arg1.inspect
  puts arg2.inspect
  puts rest.inspect
  puts kwarg1.inspect
  puts kwarg2.inspect
  puts kwrest.inspect
  puts block.inspect
  puts block.call.inspect
end

foo("arg1", "arg2", "arg3", "arg4", kwarg1: "kwarg1", kwarg2: "kwarg2", kwarg3: "kwarg3", kwarg4: "kwarg4") do
  "block"
end
