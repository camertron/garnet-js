class Foo
  def bar(arg1, arg2 = "arg2", *rest, post, kwarg1:, kwarg2: "kwarg2", **kwrest, &block)
  end
end

puts Foo.new.method(:bar).parameters.inspect
