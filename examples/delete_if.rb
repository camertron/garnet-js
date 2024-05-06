h = {foo: 0, bar: 1, baz: 2}
h.delete_if {|key, value| value > 0 } # => {:foo=>0}
puts h.inspect
