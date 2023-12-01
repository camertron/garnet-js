handled_name_error = false
handled_load_error = false

begin
    require "foo"
rescue NameError
    handled_name_error = true
rescue LoadError
    handled_load_error = true
end

puts [handled_name_error, handled_load_error].inspect
