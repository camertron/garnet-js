class Link < Phlex::HTML
	def initialize(text, to:, active:)
		@text = text
		@to = to
		@active = active
	end

	def template
		a(href: @to, class: tokens("nav-item", active?: "active")) { @text }
	end

	private

	def active? = @active
end

class TokensExample < Phlex::HTML
	def template
		nav {
			ul {
				li { render Link.new("Home", to: "/", active: true) }
				li { render Link.new("About", to: "/about", active: false) }
			}
		}
	end
end

puts TokensExample.new.call
