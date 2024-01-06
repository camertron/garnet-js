class Thing
end

a = %q{def hello() "Hello there!" end}

Thing.class_eval(a)
puts Thing.new.hello
