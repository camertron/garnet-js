def foo
  bar = "bar"
  [1].each do |i|
    bar = "baz"
  end
  bar
end

puts foo
