# class Foo
#   def each
#     return to_enum(:each) unless block_given?
#     yield 1
#     yield 2
#   end
# end

# Foo.new.each.each { |elem| puts elem.inspect }


# arr = [1, 2, 3]
# arr.to_enum(:each).each { |elem| puts elem.inspect }


# fib = Enumerator.new do |y|
#   a = b = 1
#   loop do
#     y << a
#     a, b = b, a + b
#   end
# end

# puts fib.next
# puts fib.next

puts [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].lazy.select(&:odd?).first(4).inspect
w
