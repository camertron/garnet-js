class Foo < Object
  def bar
    "foo"
  end
end

class Bar < Foo
  def bar
    "bar"
  end
end

puts Foo.new.bar
puts Bar.new.bar
