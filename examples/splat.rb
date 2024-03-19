# def foo(*args)
#   args.join(" ")
# end

# arr1 = %w(god rest)
# arr2 = %w(merry gentlemen)

# puts foo(*arr1, "ye", *arr2)

# def bar(arg1, arg2)
#   puts [arg1, arg2].inspect
# end
#

def bar(*args)
  puts args.inspect
end

def foo(*args)
  bar(*args)
end

foo("bar", "baz")
