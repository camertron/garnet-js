class CustomTagExample < Phlex::HTML
	register_element :trix_editor

	def template
		trix_editor input: "content", autofocus: true
	end
end

puts CustomTagExample.new.call
