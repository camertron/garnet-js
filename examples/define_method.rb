class Foo
  define_method(:foo) do |arg1, arg2, &block|
    [arg1, arg2, block.call].join("-")
  end
end

puts Foo.new.foo("abc", "def") { "ghi" }

# class Bar
#   def self.define_it(name)
#     instance_variable = :"@#{name}"

#     self.define_method(name) do
#       if !self.instance_variable_defined?(instance_variable)
#         self.instance_variable_set(instance_variable, "foo")
#       end

#       return self.instance_variable_get(instance_variable)
#     end
#   end
# end

# Bar.define_it(:bar)
# b = Bar.new
# puts b.bar
# puts b.bar
