class Nav < Phlex::HTML
  def template
    nav(class: "main-nav") {
      ul {
        li { a(href: "/") { "Home" } }
        li { a(href: "/about") { "About" } }
        li { a(href: "/contact") { "Contact" } }
      }
    }
  end
end

puts Nav.new.call
