def foo(*args)
  args
end

puts foo(*%w[a b], *%w[c d]).inspect
