# frozen_string_literal: true

# @api private
class Basic < BasicObject
	define_method :__class__,
		::Object.instance_method(:class)
end

puts Basic.new.__class__.inspect
