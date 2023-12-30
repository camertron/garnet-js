def foo2(*args)
  puts args.inspect
end

def foo(*args)
  foo2(*args)
end

foo("god", "rest", "ye", "merry", "gentlemen")
