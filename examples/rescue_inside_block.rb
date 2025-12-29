[1, 2].each do |i|
  puts "Iteration #{i}"

  begin
    raise "Foo"
  rescue RuntimeError
    next
  end

  puts "This line should not execute"
end
