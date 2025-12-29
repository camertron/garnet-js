class SimpleComponent < Phlex::HTML
  def view_template
    h1 { "Hello World" }
  end
end

puts SimpleComponent.new.call

