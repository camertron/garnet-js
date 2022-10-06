class Foo
  def initialize(arg)
    @arg = arg
  end

  def arg
    @arg
  end
end

puts Foo.new("foo").arg
