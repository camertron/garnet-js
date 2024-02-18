class Hello < Phlex::HTML
	def initialize(name:)
		@name = name
	end

	def template
		h1 { "👋 Hello #{@name}!" }
	end
end

class Example < Phlex::HTML
	def template
		render Hello.new(name: "Joel")
		render Hello.new(name: "Alexandre")
	end
end

puts Example.new.call
