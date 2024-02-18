class Card < Phlex::HTML
	def template(&)
		article(class: "card", &)
	end

	def title(&)
		div(class: "title", &)
	end

	def body(&)
		div(class: "body", &)
	end
end

class CardExample < Phlex::HTML
	def template
		render Card.new do |card|
			card.title do
				h1 { "Title" }
			end

			card.body do
				p { "Body" }
			end
		end
	end
end

puts CardExample.new.call
