class Foo
  def foo
    "foo"
  end
end

method_with_block do
  puts Foo.new.foo
end
