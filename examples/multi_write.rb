# @arguments = [:==, 12]
# operation, *arguments = *@arguments

# puts operation.inspect
# puts arguments.inspect



a = { a: :a }
b = { b: :b }
c = { c: [:c] }
d = { d: :d }

e = :e
f = :f
g = :g
h = :h

a[:a], b[:b], *c[:c], d[:d] = e, f, g, h

puts a.inspect
puts b.inspect
puts c.inspect
puts d.inspect



# a = :a
# b = :b
# c = :c
# d = :d

# a, b[:b] = c, d
# puts "a: #{a}"
# puts "b: #{b}"

# foo, bar, *baz, boo = [1, 2, 3, 4, 5, 6, 7]

# results = {
#   foo: foo,
#   bar: bar,
#   baz: baz,
#   boo: boo
# }

# puts results.inspect


# a, b, c = [1, 2, 3]
# puts a
# puts b
# puts c


# @arguments = [1, 2, 3]
# operation, *arguments = *@arguments
# puts operation.inspect
# puts arguments.inspect
