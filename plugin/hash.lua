local Hash = {}

function Hash.fnv1a(str)
	local hash = 0x811c9dc5
	for i = 1, #str do
		hash = bit32.bxor(hash, string.byte(str, i))
		hash = (bit32.lshift(hash, 24) + hash * 403) % 0x100000000
	end
	return string.format("%x", hash)
end

function Hash.hashScript(instance)
	local ok, source = pcall(function()
		return instance.Source
	end)
	if not ok or source == nil then
		source = ""
	end
	return Hash.fnv1a(source)
end

function Hash.fingerprint(instance)
	local childCount = #instance:GetChildren()
	return instance.ClassName .. "|" .. instance.Name .. "|" .. tostring(childCount)
end

function Hash.hashNonScript(instance)
	return Hash.fnv1a(Hash.fingerprint(instance))
end

return Hash
