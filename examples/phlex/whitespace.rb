class Links < Phlex::HTML
	def view_template
		a(href: "/") { "Home" }
		whitespace
		a(href: "/about") { "About" }
		whitespace
		a(href: "/contact") { "Contact" }
	end
end

puts Links.new.call
