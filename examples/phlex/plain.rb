class Heading < Phlex::HTML
	def view_template
		h1 do
			strong { "Hello " }
			plain "World!"
		end
	end
end

puts Heading.new.call
