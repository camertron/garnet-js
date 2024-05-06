module Foo
  def view_template(&block)
    div { super }
  end
end

class Bar < Phlex::HTML
  prepend Foo

  def view_template(&block)
    "text"
  end
end

puts Bar.new.call
