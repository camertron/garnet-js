def cameron(foo, bar = nil, baz: true)
  puts "foo: #{foo.inspect}"
  puts "bar: #{bar.inspect}"
  puts "baz: #{baz.inspect}"
end

cameron("foo", baz: "baz")
