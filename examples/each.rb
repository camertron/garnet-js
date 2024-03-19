class Foo
  def initialize(arr)
    @arr = arr
  end

  def each(&block)
    @arr.each(&block)
  end
end

Foo.new([1, 2]).each do |item|
  puts item
end
