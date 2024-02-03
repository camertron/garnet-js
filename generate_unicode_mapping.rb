path = ARGV[1]

File.open(path, "w+") do |f|
  f.puts("// mapping of unicode codepoints to non-unicode codepoints")
  f.puts("const to_unicode: Map<number, number> = new Map(Object.entries({")

  if ARGV[0].start_with?("https://")
    url = ARGV[0]
    require 'open-uri'
    lines = URI.open(url).read.split(/\r?\n/)
    lines.reject! { |line| line.start_with? ("#") }
    lines.map do |line|
      jis_cp_hex, unicode_cp_hex, = line.split("\t")
      jis_cp = jis_cp_hex[2..].to_i(16)
      unicode_cp = unicode_cp_hex[2..].to_i(16)
      f.puts("  #{jis_cp}:#{unicode_cp},")
    end
  else
    from_encoding = ARGV[0]

    File.open(path, "w+") do |f|
      (0..0x10FFFF).each do |cp|
        begin
          encoded_cp = [cp].pack("U").encode(from_encoding).codepoints.first
          f.puts("  #{encoded_cp}:#{cp},")
        rescue Encoding::UndefinedConversionError
        rescue Encoding::InvalidByteSequenceError
        end
      end
    end
  end

  f.puts("}));\n\n")
  f.puts("// mapping of non-unicode codepoints to unicode codepoints")
  f.puts("const from_unicode = new Map(Array.from(to_unicode, a => a.reverse()));\n\n")
  f.puts("export { to_unicode, from_unicode };")
end
