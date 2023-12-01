def foo(required, optional = nil, *rest, post)
  {
    required: required,
    optional: optional,
    rest: rest,
    post: post
  }
end

puts foo("required", nil, "post").inspect
