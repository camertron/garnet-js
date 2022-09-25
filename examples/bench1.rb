class Foo
  def bar
    STDERR.puts "bar"
  end
end

def run
  Foo.new.bar
end
