# This file is used by Rack-based servers to start the application.

require_relative "demo/config/environment"

run Rails.application
Rails.application.load_server
