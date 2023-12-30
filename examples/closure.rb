class Foo
  def my_lambda
    local = "foo local"
    @my_lambda ||= lambda { local }
  end
end

puts Foo.new.my_lambda.call
