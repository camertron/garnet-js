class Foo
  def bar(&block)
    if block
      puts "Received block"
    else
      puts "Did not receive block"
    end
  end
end

def foo(&block)
  Foo.new.bar(&block)
end

foo { 1 }
