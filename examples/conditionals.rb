def compare(a, b)
  if a > b
    :greater
  elsif a < b
    :lesser
  elsif a == b
    :equal
  end
end

puts compare(2, 1)
puts compare(1, 2)
puts compare(1, 1)
