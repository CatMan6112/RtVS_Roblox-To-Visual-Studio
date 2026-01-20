-- RtVS Plugin: Studio Watcher
-- Watches for changes in Studio instances and sends them to the server
-- Used when "Prioritize Studio" mode is enabled

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local StudioWatcher = {}

-- Server configuration
local SERVER_URL = "http://localhost:8080"

-- Helper function to serialize Vector3
local function serializeVector3(vector)
	return {
		X = vector.X,
		Y = vector.Y,
		Z = vector.Z
	}
end

-- Helper function to serialize Vector2
local function serializeVector2(vector)
	return {
		X = vector.X,
		Y = vector.Y
	}
end

-- Helper function to serialize Color3
local function serializeColor3(color)
	return {
		R = color.R,
		G = color.G,
		B = color.B
	}
end

-- Helper function to serialize CFrame
local function serializeCFrame(cf)
	local x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = cf:GetComponents()
	return {
		Position = {X = x, Y = y, Z = z},
		Components = {r00, r01, r02, r10, r11, r12, r20, r21, r22}
	}
end

-- Helper function to serialize common property types
local function serializeProperty(value)
	local valueType = typeof(value)

	if valueType == "Vector3" then
		return serializeVector3(value)
	elseif valueType == "Vector2" then
		return serializeVector2(value)
	elseif valueType == "Color3" then
		return serializeColor3(value)
	elseif valueType == "CFrame" then
		return serializeCFrame(value)
	elseif valueType == "BrickColor" then
		return value.Name
	elseif valueType == "EnumItem" then
		return tostring(value)
	elseif valueType == "Instance" then
		return value:GetFullName()
	elseif valueType == "string" or valueType == "number" or valueType == "boolean" then
		return value
	else
		return tostring(value)
	end
end

-- List of common properties to serialize
local commonProperties = {
	"Anchored", "CanCollide", "CastShadow", "Color", "Material",
	"Reflectance", "Transparency", "Size", "Position", "Orientation",
	"CFrame", "BrickColor", "Source", "Disabled", "PrimaryPart",
	"Brightness", "Ambient", "OutdoorAmbient", "ColorShift_Top", "ColorShift_Bottom",
	"Health", "MaxHealth", "WalkSpeed", "JumpPower",
}

-- Function to read properties of an instance
local function getInstanceProperties(instance)
	local properties = {}

	for _, propName in ipairs(commonProperties) do
		local success, value = pcall(function()
			return instance[propName]
		end)

		if success and value ~= nil then
			properties[propName] = serializeProperty(value)
		end
	end

	local attributes = instance:GetAttributes()
	if next(attributes) ~= nil then
		properties.Attributes = attributes
	end

	return properties
end

-- Get the file path for an instance
local function getInstanceFilePath(instance)
	local pathParts = {}
	local current = instance

	-- Build path from instance to root service
	while current and current.Parent ~= game do
		table.insert(pathParts, 1, current.Name)
		current = current.Parent
	end

	-- Add service name
	if current then
		table.insert(pathParts, 1, current.Name)
	else
		return nil
	end

	-- Determine file extension and path
	local basePath = table.concat(pathParts, "/")

	-- Check if instance is a script
	if instance:IsA("LuaSourceContainer") then
		-- Check if it has children
		if #instance:GetChildren() > 0 then
			-- Script with children -> folder with __main__.lua
			return basePath .. "/__main__.lua"
		else
			-- Script without children -> standalone .lua file
			return basePath .. ".lua"
		end
	else
		-- Non-script object -> folder with __main__.json
		return basePath .. "/__main__.json"
	end
end

-- Send file change to server
local function sendFileChange(filePath, content, changeType)
	local success, response = pcall(function()
		local payload = {
			path = filePath,
			content = content,
			type = changeType
		}

		return HttpService:PostAsync(
			SERVER_URL .. "/studio-change",
			HttpService:JSONEncode(payload),
			Enum.HttpContentType.ApplicationJson
		)
	end)

	if success then
		print("Sent", changeType, "to server:", filePath)
	else
		warn("Failed to send change to server:", response)
	end
end

-- Handle instance property changes
local function handlePropertyChanged(instance)
	local filePath = getInstanceFilePath(instance)
	if not filePath then return end

	-- For scripts, we need to check if it's a Source change
	if instance:IsA("LuaSourceContainer") then
		local scriptPath = filePath
		local jsonPath = filePath:gsub("%.lua$", ".json")

		-- If script has children, use __main__ paths
		if #instance:GetChildren() > 0 then
			scriptPath = filePath -- Already ends with __main__.lua
			jsonPath = filePath:gsub("__main__%.lua$", "__main__.json")
		else
			jsonPath = filePath:gsub("%.lua$", ".json")
			-- Actually, standalone scripts don't have separate JSON files
			-- Only update the .lua file
			jsonPath = nil
		end

		-- Send script source
		sendFileChange(scriptPath, instance.Source, "update")

		-- Send properties if needed (for scripts with children)
		if jsonPath and #instance:GetChildren() > 0 then
			local properties = {
				ClassName = instance.ClassName,
				Name = instance.Name,
				Properties = getInstanceProperties(instance)
			}
			sendFileChange(jsonPath, HttpService:JSONEncode(properties), "update")
		end
	else
		-- Non-script object - update __main__.json
		local properties = {
			ClassName = instance.ClassName,
			Name = instance.Name,
			Properties = getInstanceProperties(instance)
		}
		sendFileChange(filePath, HttpService:JSONEncode(properties), "update")
	end
end

-- Handle instance added
local function handleInstanceAdded(instance)
	local filePath = getInstanceFilePath(instance)
	if not filePath then return end

	if instance:IsA("LuaSourceContainer") then
		-- Send script source
		sendFileChange(filePath, instance.Source, "create")

		-- Send properties if it has children
		if #instance:GetChildren() > 0 then
			local jsonPath = filePath:gsub("__main__%.lua$", "__main__.json")
			local properties = {
				ClassName = instance.ClassName,
				Name = instance.Name,
				Properties = getInstanceProperties(instance)
			}
			sendFileChange(jsonPath, HttpService:JSONEncode(properties), "create")
		end
	else
		-- Non-script object
		local properties = {
			ClassName = instance.ClassName,
			Name = instance.Name,
			Properties = getInstanceProperties(instance)
		}
		sendFileChange(filePath, HttpService:JSONEncode(properties), "create")
	end
end

-- Handle instance removed
local function handleInstanceRemoved(instance)
	local filePath = getInstanceFilePath(instance)
	if not filePath then return end

	sendFileChange(filePath, "", "delete")

	-- Also delete the JSON file if it's a script with children
	if instance:IsA("LuaSourceContainer") and #instance:GetChildren() > 0 then
		local jsonPath = filePath:gsub("__main__%.lua$", "__main__.json")
		sendFileChange(jsonPath, "", "delete")
	end
end

-- Connection tracking
local connections = {}

-- Start watching a service
local function watchService(service)
	-- Watch for new children
	connections[#connections + 1] = service.ChildAdded:Connect(function(child)
		handleInstanceAdded(child)
		watchDescendants(child)
	end)

	-- Watch for removed children
	connections[#connections + 1] = service.ChildRemoved:Connect(function(child)
		handleInstanceRemoved(child)
	end)

	-- Watch existing descendants
	for _, descendant in ipairs(service:GetDescendants()) do
		watchDescendants(descendant)
	end
end

-- Watch a descendant and its future descendants
function watchDescendants(instance)
	-- Watch property changes
	connections[#connections + 1] = instance.Changed:Connect(function(_property)
		handlePropertyChanged(instance)
	end)

	-- Watch for new descendants
	connections[#connections + 1] = instance.DescendantAdded:Connect(function(descendant)
		handleInstanceAdded(descendant)
		watchDescendants(descendant)
	end)

	-- Watch for removed descendants
	connections[#connections + 1] = instance.DescendantRemoving:Connect(function(descendant)
		handleInstanceRemoved(descendant)
	end)
end

-- Start watching Studio for changes
function StudioWatcher.start()
	print("Started watching Studio for changes")

	-- Watch all services
	local servicesToWatch = {
		game.Workspace,
		game:GetService("ReplicatedStorage"),
		game:GetService("ReplicatedFirst"),
		game:GetService("ServerScriptService"),
		game:GetService("ServerStorage"),
		game:GetService("StarterGui"),
		game:GetService("StarterPack"),
		game:GetService("StarterPlayer"),
		game:GetService("Lighting"),
		game:GetService("SoundService"),
		game:GetService("Chat"),
		game:GetService("LocalizationService"),
		game:GetService("TestService"),
	}

	for _, service in ipairs(servicesToWatch) do
		watchService(service)
	end
end

-- Stop watching Studio
function StudioWatcher.stop()
	print("Stopped watching Studio")

	-- Disconnect all connections
	for _, connection in ipairs(connections) do
		connection:Disconnect()
	end

	connections = {}
end

return StudioWatcher
