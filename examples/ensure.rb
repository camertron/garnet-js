def foo
  puts "Begin"

  begin
    puts "Yielding"
    yield
    $cameron = true
  rescue
    puts "Rescued"
  ensure
    puts "Ensure ran!"
  end

  puts "End"
end

foo do
  puts "Yielded"
  # raise
end
