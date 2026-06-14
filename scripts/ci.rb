#! /usr/bin/env ruby

test_files = Dir.glob("ruby/spec/**/*_spec.rb")
tests_to_skip = File.read("scripts/tests_to_skip.txt").split("\n")
tests_to_run = test_files - tests_to_skip

exec "./exe/mspec-run #{tests_to_run.join(" ")}"
