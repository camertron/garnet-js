class Heading < Phlex::HTML
	def template
		h1 do
			strong { "Hello " }
			plain "World!"
		end
	end
end

puts Heading.new.call
