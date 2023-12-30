def max(a, b)
  return a if a > b
  b
end

def return_from_block
  [1, 2].map do |i|
    [3, 4].map do |j|
      return [i, j]
    end
  end
end

puts max(1, 2).inspect
puts max(3, 2).inspect

puts return_from_block.inspect
