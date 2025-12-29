foo = [1, 2, 3, 4]

odd, foo = foo.partition(&:odd?)

puts "Odd: #{odd.inspect}"
puts "Even: #{foo.inspect}"
