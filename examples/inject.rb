puts [1, 2, 3, 4].inject {|sum, n| sum + n*n }
puts [1, 2, 3, 4].inject(2) {|sum, n| sum + n*n }
puts [1, 2, 3, 4].inject(10, :+)
puts %w[a b c].inject(['x'], :push).inspect