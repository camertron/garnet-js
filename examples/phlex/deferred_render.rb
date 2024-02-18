class List < Phlex::HTML
	include Phlex::DeferredRender

	def initialize
		@items = []
	end

	def template
		if @header
			h1(class: "header", &@header)
		end

		ul do
			@items.each do |item|
				li { render(item) }
			end
		end
	end

	def header(&block)
		@header = block
	end

	def with_item(&content)
		@items << content
	end
end

class ListExample < Phlex::HTML
	def template
		render List.new do |list|
			list.header do
				"Header"
			end

			list.with_item do
				"One"
			end

			list.with_item do
				"two"
			end
		end
	end
end

puts ListExample.new.call
