class Foo
  def foo(arg)
    "foo #{arg}"
  end
end

class Bar < Foo
  def foo(arg)
    super
  end
end

puts Bar.new.foo("bar")
