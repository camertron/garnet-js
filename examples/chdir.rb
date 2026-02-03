puts Dir.getwd
Dir.chdir("lib") do
  puts Dir.getwd
  puts Dir.glob("**/*").inspect
end
puts Dir.getwd
