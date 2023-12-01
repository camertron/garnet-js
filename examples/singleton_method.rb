begin
  require 'pp'
rescue LoadError
  module Kernel
    def pretty_inspect
      inspect
    end
  end
end

class Foo
end

puts Foo.new.pretty_inspect