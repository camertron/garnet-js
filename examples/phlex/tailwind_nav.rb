class Nav < Phlex::HTML
  def template(&content)
  	nav(class: "main-nav") {
			ul(&content)
  	}
  end

  def item(url, &content)
  	li { a(href: url, &content) }
  end
end

class TailwindNav < Nav
	def template(&content) = nav(class: "flex flex-row gap-4", &content)

	def item(url, &content)
	  a(href: url, class: "text-underline", &content)
	end
end

nav = TailwindNav.new do |nav|
	nav.item("/") { "Home" }
	nav.item("/about") { "About" }
	nav.item("/contact") { "Contact" }
end

puts nav.call
