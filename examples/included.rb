module A
  def A.included(mod)
    puts "#{self} included in #{mod}"
  end
end

module B
  include A
end
