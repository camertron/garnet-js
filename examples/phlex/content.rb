class Card < Phlex::HTML
	def view_template
		article(class: "drop-shadow") {
			yield
		}
	end
end

class Example < Phlex::HTML
	def view_template
		render(Card.new) {
			h1 { "👋 Hello!" }
		}
	end
end

puts Example.new.call
