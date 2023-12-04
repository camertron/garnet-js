foo = [nil]
puts (foo[0] ||= "foo")
puts foo.inspect
