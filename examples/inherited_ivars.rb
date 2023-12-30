# class Foo
#   class << self
#     def bar
#       @bar ||= "bar"
#     end
#   end

#   def initialize
#     @foo = "foo"
#   end
# end

# class Bar < Foo
#   def something
#     @foo
#   end
# end

# puts Bar.new.something
# puts Foo.bar.object_id
# puts Bar.bar.object_id

class Foo
  class << self
    def items
      @items ||= []
    end
  end
end

class Bar < Foo
  def items
    Foo.items
  end
end

puts Foo.items.object_id
puts Bar.items.object_id
puts Bar.new.items.object_id
