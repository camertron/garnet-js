require "bundler/inline"

gemfile(true) do
  source "https://rubygems.org"
  gem "benchmark-ips"
end

require "benchmark/ips"

class Foo
  def bar
    STDERR.puts "bar"
  end
end

def run
  Foo.new.bar
end

Benchmark.ips do |x|
  x.report("New instance + method call") do
    run
  end
end
