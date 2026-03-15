local PathUtils = {}

local RESERVED_NAMES = {
	CON=true, PRN=true, AUX=true, NUL=true,
	COM1=true, COM2=true, COM3=true, COM4=true, COM5=true,
	COM6=true, COM7=true, COM8=true, COM9=true,
	LPT1=true, LPT2=true, LPT3=true, LPT4=true, LPT5=true,
	LPT6=true, LPT7=true, LPT8=true, LPT9=true,
}

function PathUtils.sanitizeName(name)
	name = name:gsub('[<>:"/\\|?*%z]', "_")
	name = name:match("^%s*(.-)%s*$") or name
	name = name:gsub("[.%s]+$", "")
	name = name:gsub("^%.+", "")
	if RESERVED_NAMES[name:upper()] then
		name = "_" .. name
	end
	if #name == 0 then
		name = "Unnamed"
	end
	return name
end

function PathUtils.getFileSystemName(instance)
	local fsName = instance:GetAttribute("_rtvs_fsName")
	if fsName then
		return fsName
	end
	return PathUtils.sanitizeName(instance.Name)
end

function PathUtils.getInstanceFilePath(instance)
	local pathParts = {}
	local current = instance

	while current and current.Parent ~= game do
		table.insert(pathParts, 1, PathUtils.getFileSystemName(current))
		current = current.Parent
	end

	if current then
		table.insert(pathParts, 1, current.Name)
	else
		return nil
	end

	local basePath = table.concat(pathParts, "/")

	if instance:IsA("LuaSourceContainer") then
		if #instance:GetChildren() > 0 then
			return basePath .. "/__main__.lua"
		else
			local extension = ".lua"
			if instance.ClassName == "LocalScript" then
				local storedExt = instance:GetAttribute("_rtvs_fileExt")
				extension = storedExt or ".client.lua"
			elseif instance.ClassName == "ModuleScript" then
				extension = ".module.lua"
			end
			return basePath .. extension
		end
	else
		return basePath .. "/__main__.json"
	end
end

function PathUtils.getInstanceBasePath(instance)
	local pathParts = {}
	local current = instance

	while current and current.Parent ~= game do
		table.insert(pathParts, 1, PathUtils.getFileSystemName(current))
		current = current.Parent
	end

	if current then
		table.insert(pathParts, 1, current.Name)
	else
		return nil
	end

	return table.concat(pathParts, "/")
end

return PathUtils
