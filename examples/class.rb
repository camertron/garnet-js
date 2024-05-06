module Baz
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
end

puts Baz::Foo.new.bar
puts Baz::Bar.new.bar
