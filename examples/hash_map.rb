hash = { a: "a", b: "b" }
hash.each do |k, v|
  puts "#{k.inspect} = #{v.inspect}"
end

hash.each do |arr|
  puts arr.inspect
  # puts "#{arr[0].inspect} = #{arr[1].inspect}"
end
