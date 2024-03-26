class Mock
  def initialize(target)
    @target = target
    @interceptor = Module.new

    @target.singleton_class.prepend(@interceptor)
  end

	attr_reader :target

  def replace(method, &hook)
    @interceptor.define_method(method) do
      puts "Replaced foo"
      super()
    end
  end
end

class Thing
  def foo
    puts "foo from Thing"
  end
end

thing = Thing.new
mock = Mock.new(thing)
mock.replace(:foo)
thing.foo
