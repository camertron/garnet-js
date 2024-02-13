module Mod
  def one
    "This is one"
  end
  module_function :one
end

class Cls
  include Mod
  def call_one
    one
  end
end

puts Mod.one     #=> "This is one"

c = Cls.new
puts c.call_one  #=> "This is one"

module Mod
  def one
    "This is the new one"
  end
end

puts Mod.one     #=> "This is one"
puts c.call_one  #=> "This is the new one"
