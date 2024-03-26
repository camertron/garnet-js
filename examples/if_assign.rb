def bar
  nil
end

def baz
  if foo = bar
    return foo
  else
    "nope"
  end
end

puts baz
