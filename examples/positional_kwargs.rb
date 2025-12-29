def foo(arg1, arg2 = nil)
  [arg1, arg2]
end

puts foo("bar", baz: :boo).inspect
