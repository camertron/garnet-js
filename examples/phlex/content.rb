class Card < Phlex::HTML
	def template
		article(class: "drop-shadow") {
			yield
		}
	end
end

class Example < Phlex::HTML
	def template
		render(Card.new) {
			h1 { "👋 Hello!" }
		}
	end
end

puts Example.new.call
