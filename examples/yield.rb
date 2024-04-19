# def foo
#   yield "foo"
#   yield "bar"
# end

# foo do |item|
#   puts item
# end

@target = ""

def yield_content
  @target << yield
  nil
end

def h1(&block)
  @target << "<h1>"
  yield_content(&block)
  @target << "</h1>"
end

def view_template
  h1 {
    yield
  }
end

view_template { "Content" }
puts @target
