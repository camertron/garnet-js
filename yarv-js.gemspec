# frozen_string_literal: true

lib = File.expand_path("../lib", __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require "yarv/version"

Gem::Specification.new do |spec|
  spec.name = "yarv-js"
  spec.version = YARV::VERSION
  spec.authors = ["Cameron C. Dutro"]

  spec.summary = "A JavaScript implementation of Ruby's YARV virtual machine."
  spec.homepage = "https://github.com/camertron/yarv-js"
  spec.license = "MIT"

  spec.files = Dir["LICENSE.txt", "README.md", "{bin,lib,spec}/**/*"]
  spec.require_paths = ["lib"]

  spec.executables << "yarv"
end
