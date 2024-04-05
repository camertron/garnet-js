module Foo
end

class Bar
  extend Foo
end

puts Bar.is_a?(Foo).inspect
