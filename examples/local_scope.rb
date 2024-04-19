$with_blocks = []

def with(&block)
  $with_blocks << block
end

["foo", "bar"].each do |thing|
  with do
    puts thing
  end
end

$with_blocks.each(&:call)
