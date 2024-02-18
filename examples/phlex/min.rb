class Component
	def initialize
		@buffer = +""
	end

	def text(string)
		@buffer << string
		nil
	end

	def h1
		@buffer << "<h1>"
		yield
		@buffer << "</h1>"
		nil
	end

	def call
		view_template
		@buffer
	end
end

class Hello < Component
	def initialize(name)
		@name = name
    super
	end

	def view_template
		h1 {
			text "Hello, "
			text @name
			text "!"
		}
	end
end

puts Hello.new("Joel").call
