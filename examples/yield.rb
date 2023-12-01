def foo
  yield "foo"
  yield "bar"
end

foo do |item|
  puts item
end
