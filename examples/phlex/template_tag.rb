class TemplateExample < Phlex::HTML
	def template
		template_tag {
			img src: "hidden.jpg", alt: "A hidden image."
		}
	end
end

puts TemplateExample.new.call
