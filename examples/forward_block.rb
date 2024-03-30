def template
  yield
end

def view_template(&block)
  template(&block)
end

view_template { puts "foooo!" }
