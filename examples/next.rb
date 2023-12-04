result = [1, 2, 3].map do |item|
  next item * 2, item * 3
  puts "hello!"
end

puts result.inspect
