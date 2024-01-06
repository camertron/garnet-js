class Foo
  define_method(:foo) do |arg1, arg2, &block|
    [arg1, arg2, block.call].join("-")
  end
end

puts Foo.new.foo("abc", "def") { "ghi" }
