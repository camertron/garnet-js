File.expand_path(File.join(__dir__, "..", "..", "gems")).tap do |gem_path|
  Dir.glob(File.join(gem_path, "*")) do |path|
    if File.directory?(path)
      $:.push(File.join(path, "lib"))
    end
  end
end
