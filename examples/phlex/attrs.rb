class Greeting < Phlex::HTML
	def template
		div(data: { controller: "hello" }) {
			# ...
		}
	end
end

puts Greeting.new.call

class ChannelControls < Phlex::HTML
	def template
		input(
			value: "1",
			name: "channel",
			type: "radio",
			checked: true
		)

		input(
			value: "2",
			name: "channel",
			type: "radio",
			checked: false
		)
	end
end

puts ChannelControls.new.call
