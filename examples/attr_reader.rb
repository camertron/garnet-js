class Foo
  attr_reader :foo

  def initialize(foo)
    @foo = foo
  end
end

puts Foo.new("foo").foo
