f = Struct.new(:foo, :bar)
instance = f.new(1, 2)
puts instance.foo.inspect
puts instance.bar.inspect
instance.foo = "foo"
puts instance.foo.inspect
