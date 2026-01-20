-- RtVS Plugin: Deserializer
-- Applies file changes from the server to Roblox Studio instances

local HttpService = game:GetService("HttpService")

local Deserializer = {}

-- Helper function to deserialize Vector3
local function deserializeVector3(data)
	if type(data) ~= "table" then return nil end
	return Vector3.new(data.X or 0, data.Y or 0, data.Z or 0)
end

-- Helper function to deserialize Vector2
local function deserializeVector2(data)
	if type(data) ~= "table" then return nil end
	return Vector2.new(data.X or 0, data.Y or 0)
end

-- Helper function to deserialize Color3
local function deserializeColor3(data)
	if type(data) ~= "table" then return nil end
	return Color3.new(data.R or 0, data.G or 0, data.B or 0)
end

-- Helper function to deserialize CFrame
local function deserializeCFrame(data)
	if type(data) ~= "table" then return nil end
	local pos = data.Position
	local components = data.Components
	if not pos or not components then return nil end

	return CFrame.new(
		pos.X, pos.Y, pos.Z,
		components[1], components[2], components[3],
		components[4], components[5], components[6],
		components[7], components[8], components[9]
	)
end

-- Helper function to deserialize property values
local function deserializePropertyValue(value, valueType)
	if valueType == "Vector3" then
		return deserializeVector3(value)
	elseif valueType == "Vector2" then
		return deserializeVector2(value)
	elseif valueType == "Color3" then
		return deserializeColor3(value)
	elseif valueType == "CFrame" then
		return deserializeCFrame(value)
	elseif valueType == "BrickColor" then
		return BrickColor.new(value)
	elseif valueType == "Enum" then
		-- Parse enum strings like "Enum.Material.Plastic"
		local success, result = pcall(function()
			return loadstring("return " .. value)()
		end)
		return success and result or nil
	else
		return value
	end
end

-- Parse a file path to determine the instance path
-- Example: "Workspace/Part1/__main__.lua" -> Workspace.Part1
-- Example: "ServerScriptService/MyScript.lua" -> ServerScriptService.MyScript
-- Example: "ServerScriptService/MyScript.client.lua" -> ServerScriptService.MyScript
-- Example: "ServerScriptService/MyScript.local.lua" -> ServerScriptService.MyScript
function Deserializer.parsePath(filePath)
	-- Normalize path separators (handle both / and \)
	filePath = filePath:gsub("\\", "/")

	-- Remove file extension (handles .client.lua, .local.lua, .module.lua, .lua, .json)
	-- Remove .client.lua, .local.lua, .module.lua first, then fallback to generic extension removal
	local pathWithoutExt = filePath:gsub("%.client%.lua$", "")
	pathWithoutExt = pathWithoutExt:gsub("%.local%.lua$", "")
	pathWithoutExt = pathWithoutExt:gsub("%.module%.lua$", "")
	pathWithoutExt = pathWithoutExt:match("(.+)%..+$") or pathWithoutExt

	-- Remove __main__ if present
	pathWithoutExt = pathWithoutExt:gsub("/__main__$", "")

	-- Split by /
	local parts = {}
	for part in pathWithoutExt:gmatch("[^/]+") do
		table.insert(parts, part)
	end

	return parts
end

-- Find or create an instance at the given path
function Deserializer.findOrCreateInstance(pathParts, className)
	if #pathParts == 0 then
		return nil
	end

	-- First part should be a service name
	local serviceName = pathParts[1]
	local success, service = pcall(function()
		return game:GetService(serviceName)
	end)

	if not success then
		-- Try direct game children (like Workspace)
		service = game:FindFirstChild(serviceName)
	end

	if not service then
		warn("Could not find service:", serviceName)
		return nil
	end

	local current = service

	-- Navigate/create path
	for i = 2, #pathParts do
		local childName = pathParts[i]
		local child = current:FindFirstChild(childName)

		if not child then
			-- Create the instance
			-- Use provided className or default to Folder
			local newClassName = (i == #pathParts and className) or "Folder"

			local success, newChild = pcall(function()
				local instance = Instance.new(newClassName)
				instance.Name = childName
				instance.Parent = current
				return instance
			end)

			if success then
				child = newChild
				print("Created", newClassName, "at", current:GetFullName() .. "." .. childName)
			else
				warn("Could not create", newClassName, "at", current:GetFullName())
				return nil
			end
		end

		current = child
	end

	return current
end

-- Apply property changes to an instance
function Deserializer.applyProperties(instance, properties)
	if not instance or not properties then return end

	for propName, propValue in pairs(properties) do
		if propName == "Attributes" then
			-- Set custom attributes
			for attrName, attrValue in pairs(propValue) do
				instance:SetAttribute(attrName, attrValue)
			end
		else
			-- Set regular properties
			local success, error = pcall(function()
				-- Try to infer type from current value
				local currentValue = instance[propName]
				local valueType = typeof(currentValue)

				local deserializedValue = deserializePropertyValue(propValue, valueType)
				if deserializedValue ~= nil then
					instance[propName] = deserializedValue
				else
					instance[propName] = propValue
				end
			end)

			if not success then
				-- Property might not exist or be read-only
				-- Silently skip (Source property will be handled separately)
			end
		end
	end
end

-- Determine the ClassName from the file path
function Deserializer.inferClassName(filePath)
	-- Check file extension patterns
	-- .client.lua or .local.lua = LocalScript
	-- .module.lua = ModuleScript
	-- .lua = Script
	if filePath:match("%.client%.lua$") or filePath:match("%.local%.lua$") then
		return "LocalScript"
	elseif filePath:match("%.module%.lua$") then
		return "ModuleScript"
	elseif filePath:match("%.lua$") then
		-- Plain .lua extension = Script
		return "Script"
	elseif filePath:match("%.json$") then
		-- Property file, parent should already exist
		return nil
	else
		-- Unknown, default to Folder
		return "Folder"
	end
end

-- Apply a file change to Studio
function Deserializer.applyChange(change)
	local changeType = change.type
	local filePath = change.path
	local content = change.content

	print("Applying", changeType, "for", filePath)

	-- Ignore index.json (it's just metadata)
	if filePath:match("^index%.json$") or filePath:match("/index%.json$") then
		return true
	end

	local pathParts = Deserializer.parsePath(filePath)

	if changeType == "delete" then
		-- Don't try to delete services or their __main__.json files
		if #pathParts == 1 then
			-- This is a service-level file, ignore deletion
			return true
		end

		-- Delete the instance
		local instance = Deserializer.findOrCreateInstance(pathParts, nil)
		if instance then
			print("Deleting", instance:GetFullName())
			instance:Destroy()
		end
		return true
	end

	-- For create/update, we need content
	if not content then
		warn("No content provided for", changeType, "on", filePath)
		return false
	end

	-- Check if this is a .lua file (script)
	if filePath:match("%.lua$") then
		local className = Deserializer.inferClassName(filePath)
		local instance = Deserializer.findOrCreateInstance(pathParts, className)

		if instance and instance:IsA("LuaSourceContainer") then
			-- Update script source
			instance.Source = content
			print("Updated script:", instance:GetFullName())
			return true
		else
			warn("Instance is not a script:", instance and instance:GetFullName() or "nil")
			return false
		end

	-- Check if this is a __main__.json file (properties)
	elseif filePath:match("__main__%.json$") then
		-- Parse JSON properties
		local success, properties = pcall(function()
			return HttpService:JSONDecode(content)
		end)

		if not success then
			warn("Failed to parse JSON:", properties)
			return false
		end

		-- Check if this is a service-level __main__.json (e.g., "Workspace/__main__.json")
		if #pathParts == 1 then
			-- This is a service-level properties file
			local serviceName = pathParts[1]
			local service = game:GetService(serviceName)

			if service then
				-- Apply properties to the service
				Deserializer.applyProperties(service, properties.Properties)
				print("Updated service properties:", service:GetFullName())
				return true
			else
				warn("Could not find service:", serviceName)
				return false
			end
		else
			-- This is a regular instance __main__.json
			local instance = Deserializer.findOrCreateInstance(pathParts, properties.ClassName)

			if instance then
				-- Apply properties
				Deserializer.applyProperties(instance, properties.Properties)
				print("Updated properties:", instance:GetFullName())
				return true
			else
				warn("Could not find/create instance for", filePath)
				return false
			end
		end
	else
		warn("Unknown file type:", filePath)
		return false
	end
end

return Deserializer
