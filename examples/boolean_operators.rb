def sort(a, b, c)
  if a < b && b < c && a < c
    [a, b, c]
  elsif a < c && c < b && a < b
    [a, c, b]
  elsif b < a && a < c && b < c
    [b, a, c]
  elsif b < c && c < a && b < a
    [b, c, a]
  elsif c < a && a < b && c < b
    [c, a, b]
  elsif c < b && b < a && c < a
    [c, b, a]
  end
end

def equal?(a, b, c)
  a == b || a == c
end

puts sort(1, 2, 3).inspect
puts sort(1, 3, 2).inspect
puts sort(2, 1, 3).inspect
puts sort(2, 3, 1).inspect
puts sort(3, 1, 2).inspect
puts sort(3, 2, 1).inspect

puts equal?(1, 2, 3)
puts equal?(1, 2, 1)
puts equal?(1, 1, 2)
