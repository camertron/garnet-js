class Example < Phlex::HTML
	def before_template
		h1 { "Before" }
		super
	end

	def view_template
		h2 { "Hello World!" }
	end

	def after_template
		super
		h3 { "After" }
	end
end

puts Example.new.call
