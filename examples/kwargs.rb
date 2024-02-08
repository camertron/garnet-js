def booo
  "boo"
end

def fooo
  "foo3"
end

def foo(foo, foo2 = "foo2", foo3 = fooo, *foo_rest, bar:, baz: "baz", boo: booo, extra:, **kw_rest)
  puts foo
  puts foo2
  puts foo3
  puts foo_rest.inspect
  puts bar
  puts baz
  puts boo
  puts extra
  puts kw_rest.inspect
end

foo("foo", "foo2", "foo3", "foo4", "foo5", bar: "bar", extra: "extra", **{ moar: "moar" }, extra2: "extra2", **{ even_moar: "even_moar" })
