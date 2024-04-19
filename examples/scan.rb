s = 'cruel world'
# puts s.scan(/\w+/).inspect      # => ["cruel", "world"]
# puts s.scan(/.../).inspect      # => ["cru", "el ", "wor"]
# puts s.scan(/(...)/).inspect    # => [["cru"], ["el "], ["wor"]]
# puts s.scan(/(..)(..)/).inspect # => [["cr", "ue"], ["l ", "wo"]]

puts s.scan("l").inspect
