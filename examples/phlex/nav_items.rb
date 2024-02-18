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

nav = Nav.new do |nav|
	nav.item("/") { "Home" }
	nav.item("/about") { "About" }
	nav.item("/contact") { "Contact" }
end

puts nav.call
