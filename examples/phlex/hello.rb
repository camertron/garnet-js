class Hello < Phlex::HTML
	def initialize(name:)
		@name = name
	end

	def view_template
		h1 { "👋 Hello #{@name}!" }
	end
end

class Example < Phlex::HTML
	def view_template
		render Hello.new(name: "Joel")
		render Hello.new(name: "Alexandre")
	end
end

puts Example.new.call
