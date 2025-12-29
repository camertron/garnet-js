puts 'foo'.rindex('f') == 0
puts 'foo'.rindex('o') == 2
puts 'foo'.rindex('oo') == 1
puts 'foo'.rindex('ooo') == nil

puts 'foo'.rindex(/f/) == 0
puts 'foo'.rindex(/o/) == 2
puts 'foo'.rindex(/oo/) == 1
puts 'foo'.rindex(/ooo/) == nil
