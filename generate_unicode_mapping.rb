from_encoding = ARGV[0]
path = ARGV[1]

File.open(path, "w+") do |f|
  f.puts("// mapping of unicode to #{from_encoding.downcase} codepoints")
  f.puts("const to_unicode: Map<number, number> = new Map(Object.entries({")
  (0..0x10FFFF).each do |cp|
    begin
      encoded_cp = [cp].pack("U").encode(from_encoding).codepoints.first
      f.puts("  #{encoded_cp}:#{cp},")
    rescue Encoding::UndefinedConversionError
    rescue Encoding::InvalidByteSequenceError
    end
  end
  f.puts("}));\n\n")
  f.puts("// mapping of #{from_encoding.downcase} to unicode codepoints")
  f.puts("const from_unicode = new Map(Array.from(to_unicode, a => a.reverse()));\n\n")
  f.puts("export { to_unicode, from_unicode };")
end
