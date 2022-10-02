arr = [1, 2, 3]

new_arr = arr.map do |item|
  item * 2
end

puts new_arr.inspect