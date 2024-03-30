def foo(**nil)
end

# should raise an ArgumentError
foo(bar: "baz")
