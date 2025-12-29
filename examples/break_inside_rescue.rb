[1, 2, 3].each do |i|
  puts "Iteration #{i}"

  begin
    raise "Foo"
  rescue RuntimeError
    break
  end

  puts "This line should not execute"
end

puts "Done"

