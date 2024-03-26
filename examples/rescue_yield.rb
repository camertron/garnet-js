def around2
  yield
end

def around
  around2 do
    begin
      yield
    rescue StandardError => e
      puts "Rescued!"
    end
  end
end

around do
  [].bar
end
