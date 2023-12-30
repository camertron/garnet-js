class Foo
  attr_accessor :foo

  def initialize(foo)
    @foo = foo
  end
end

f = Foo.new("foo")
puts f.foo
f.foo = "bar"
puts f.foo
