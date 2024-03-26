def print(file)
  puts file
end

Dir.glob("*.*", &method(:print))
