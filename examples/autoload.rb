class Foo
  autoload :Bar, "autoload_bar"
end

puts Foo::Bar.new.me
