# n = 1

# while n < 4
#   puts n
#   break
# end

def loop
  puts yield 1
  puts yield 2
  puts yield 3
  puts yield 4
  puts yield 5
end

loop do |i|
  next i if i.odd?
  next i + 1
end
