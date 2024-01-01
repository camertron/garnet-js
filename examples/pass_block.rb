@blocks = []

def register(&block)
  @blocks << block
end

def run(&block)
  block.call
end

def run_all
  @blocks.each { |block| run(&block) }
end

register { puts "foo" }
register { puts "bar" }

run_all
