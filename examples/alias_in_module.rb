module Foo
  def escapeHTML(string)
    string
  end

  alias escape_html escapeHTML
end

class Bar
  include Foo
end

puts Bar.new.escape_html("bar")
