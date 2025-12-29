# encoding: binary

puts 'THX1138'.succ == "THX1139"
puts '<<koala>>'.succ == "<<koalb>>"
puts '***'.succ == '**+'

puts '00'.succ == "01"
puts '09'.succ == "10"
puts '99'.succ == "100"

puts 'aa'.succ == "ab"
puts 'az'.succ == "ba"
puts 'zz'.succ == "aaa"
puts 'AA'.succ == "AB"
puts 'AZ'.succ == "BA"
puts 'ZZ'.succ == "AAA"

s = 0.chr * 3
puts s == "\x00\x00\x00"
puts s.succ == "\x00\x00\x01"
s = 255.chr * 3
puts s == "\xFF\xFF\xFF"
puts s.succ == "\x01\x00\x00\x00"

puts "NZ/[]ZZZ9999".succ == "OA/[]AAA0000"

puts "(\xFF".succ == ")\x00"
puts "`\xFF".succ == "a\x00"
puts "<\xFF\xFF".succ == "=\x00\x00"

puts "/[]9999".succ == "/[]10000"
