class Nav < Phlex::HTML
  def view_template
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
