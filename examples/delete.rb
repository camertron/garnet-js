puts "abc-123".delete("a-z-", "-") == "abc123"
puts "\tjavascript:alert(1)".delete("^a-z-") == "javascriptalert"

puts "hello".delete("lo") == "he"

puts "oa^_^o".delete("a^") == "o_o"

puts "hello".delete("ej-m") == "ho"

puts "hello".delete("ej-m") == "ho"
puts "hello".delete("e-h") == "llo"
puts "hel-lo".delete("e-") == "hllo"
puts "hel-lo".delete("-h") == "ello"
puts "hel-lo".delete("---") == "hello"
puts "hel-012".delete("--2") == "hel"
puts "hel-()".delete("(--") == "hel"
puts "hello".delete("^e-h") == "he"
puts "hello^".delete("^^-^") == "^"
puts "hel--lo".delete("^---") == "--"

puts "abcdefgh".delete("a-ce-fh") == "dg"
puts "abcdefgh".delete("he-fa-c") == "dg"
puts "abcdefgh".delete("e-fha-c") == "dg"

puts "abcde".delete("ac-e") == "b"
puts "abcde".delete("^ac-e") == "acde"

puts "ABCabc[]".delete("A-a") == "bc"

puts 'Non-Authoritative Information'.delete(' \-\'') == 'NonAuthoritativeInformation'
