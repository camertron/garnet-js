module Foo
  class Bar
    def bar
      puts Module.nesting.inspect
    end
  end
end

Foo::Bar.new.bar
