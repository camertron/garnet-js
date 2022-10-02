module Foo
  def foo
    "foo"
  end
end

class Bar
  include Foo
end

puts Bar.new.foo
