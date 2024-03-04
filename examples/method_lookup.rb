module Extend
  def foo
    puts "extended foo"
  end
end

module Include
  def bar
    puts "regular bar"
  end

  def foo
    puts "included foo"
  end
end

module Prepend
  def foo
    puts "prepended foo"
  end
end

class Foo
  prepend Prepend
  include Include
  extend Extend

  def do_it
    foo
    self.class.foo
  end
end

class Foo2
  include Include

  def do_it
    foo
  end
end

# should print:
#
# prepended foo
# extended foo
# included foo
Foo.new.do_it
Foo2.new.do_it
