-- RtVS Plugin: Studio Watcher
local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local StudioWatcher = {}

local SERVER_URL = "http://localhost:8080"

-- Echo suppression: tracks paths we just applied from the file system
-- so we don't re-send them back to the server when Studio fires Changed events.
-- Uses time-based suppression (not content comparison) because Studio's
-- JSONEncode produces different key ordering than the original file.
local suppressedChanges = {} -- { [filePath] = expires_tick }

-- Periodic cleanup of expired suppression entries
task.spawn(function()
	while true do
		task.wait(10)
		local now = tick()
		for key, expiresAt in pairs(suppressedChanges) do
			if now >= expiresAt then
				suppressedChanges[key] = nil
			end
		end
	end
end)

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
		-- Filter out internal RtVS attributes
		local filteredAttributes = {}
		for name, value in pairs(attributes) do
			if not name:match("^_rtvs_") then
				filteredAttributes[name] = value
			end
		end
		if next(filteredAttributes) ~= nil then
			properties.Attributes = filteredAttributes
		end
	end

	return properties
end

-- Mirrors the server's sanitizeName() in server/src/file-system/path-generator.ts.
-- Must be kept in sync with the TypeScript version.
local RESERVED_NAMES = {
	CON=true, PRN=true, AUX=true, NUL=true,
	COM1=true, COM2=true, COM3=true, COM4=true, COM5=true,
	COM6=true, COM7=true, COM8=true, COM9=true,
	LPT1=true, LPT2=true, LPT3=true, LPT4=true, LPT5=true,
	LPT6=true, LPT7=true, LPT8=true, LPT9=true,
}
local function sanitizeName(name)
	-- Replace invalid file system characters with underscore
	name = name:gsub('[<>:"/\\|?*%z]', "_")
	-- Trim leading/trailing whitespace
	name = name:match("^%s*(.-)%s*$") or name
	-- Remove trailing periods and spaces (Windows strips these silently)
	name = name:gsub("[.%s]+$", "")
	-- Remove leading periods (hidden files on Unix)
	name = name:gsub("^%.+", "")
	-- Prefix Windows reserved names
	if RESERVED_NAMES[name:upper()] then
		name = "_" .. name
	end
	-- Ensure not empty
	if #name == 0 then
		name = "Unnamed"
	end
	return name
end

-- Get the file system name for an instance.
-- Checks _rtvs_fsName attribute first (set by server for deduplicated/sanitized names),
-- then falls back to sanitizing the instance Name to match server behaviour.
local function getFileSystemName(instance)
	local fsName = instance:GetAttribute("_rtvs_fsName")
	if fsName then
		return fsName
	end
	return sanitizeName(instance.Name)
end

-- Get the file path for an instance
local function getInstanceFilePath(instance)
	local pathParts = {}
	local current = instance

	-- Build path from instance to root service
	-- Use file system names (which may differ from instance names for duplicates)
	while current and current.Parent ~= game do
		table.insert(pathParts, 1, getFileSystemName(current))
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
			-- Script without children -> standalone file with appropriate extension
			-- Determine extension based on ClassName
			-- .lua = Script
			-- .client.lua = LocalScript (note: .local.lua is also supported as an alias)
			-- .module.lua = ModuleScript
			local extension = ".lua" -- Default for Script
			if instance.ClassName == "LocalScript" then
				-- Prefer the stored extension to preserve aliases (e.g. .local.lua)
				local storedExt = instance:GetAttribute("_rtvs_fileExt")
				extension = storedExt or ".client.lua"
			elseif instance.ClassName == "ModuleScript" then
				extension = ".module.lua"
			end
			return basePath .. extension
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

-- Register an echo suppression entry. Called by the deserializer before
-- applying a file-system-originated change to a Studio instance.
-- Suppresses ALL outbound changes for this path for 3 seconds.
function StudioWatcher.suppressEcho(filePath)
	suppressedChanges[filePath] = tick() + 3
	-- Also suppress the canonical alias (.local.lua ↔ .client.lua) so that
	-- a DescendantAdded firing before _rtvs_fileExt is set is still suppressed.
	if filePath:match("%.local%.lua$") then
		suppressedChanges[filePath:gsub("%.local%.lua$", ".client.lua")] = tick() + 3
	elseif filePath:match("%.client%.lua$") then
		suppressedChanges[filePath:gsub("%.client%.lua$", ".local.lua")] = tick() + 3
	end
end

-- Check if a change should be suppressed (it's an echo of a FS-originated change)
local function isSuppressed(filePath)
	local expiresAt = suppressedChanges[filePath]
	if not expiresAt then
		return false
	end

	if tick() >= expiresAt then
		suppressedChanges[filePath] = nil
		return false
	end

	return true
end

-- Track last-known file path per instance for rename detection.
-- When handlePropertyChanged sees a different path than what's stored here,
-- it knows the instance was renamed and sends a delete for the old path first.
local instancePaths = {} -- { [instance] = filePath }

-- Handle instance property changes
local function handlePropertyChanged(instance)
	local filePath = getInstanceFilePath(instance)
	if not filePath then return end

	-- Rename detection: if the instance's path has changed since we last tracked it,
	-- send a delete for the old file(s) before writing the new ones.
	local oldPath = instancePaths[instance]
	if oldPath and oldPath ~= filePath then
		sendFileChange(oldPath, "", "delete")
		-- For scripts with children, the old path is __main__.lua — also delete old __main__.json
		if instance:IsA("LuaSourceContainer") and #instance:GetChildren() > 0 then
			local oldJsonPath = oldPath:gsub("__main__%.lua$", "__main__.json")
			sendFileChange(oldJsonPath, "", "delete")
		end
		-- For non-script containers, oldPath IS the __main__.json; server cleanup removes the dir
	end
	instancePaths[instance] = filePath

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

		-- Check echo suppression before sending
		if isSuppressed(scriptPath) then
			return
		end

		-- Send script source
		sendFileChange(scriptPath, instance.Source, "update")

		-- Send properties if needed (for scripts with children)
		if jsonPath and #instance:GetChildren() > 0 and not isSuppressed(jsonPath) then
			local properties = {
				ClassName = instance.ClassName,
				Name = instance.Name,
				Properties = getInstanceProperties(instance)
			}
			sendFileChange(jsonPath, HttpService:JSONEncode(properties), "update")
		end
	else
		-- Non-script object - update __main__.json
		-- Check echo suppression before doing any work
		if isSuppressed(filePath) then
			return
		end

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

	instancePaths[instance] = filePath

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
	-- Prefer the stored path: the live parent chain may already be severed
	-- when this fires (e.g. Studio Live Scripting kicks you on script delete).
	local filePath = instancePaths[instance] or getInstanceFilePath(instance)
	instancePaths[instance] = nil -- clean up tracked path
	if not filePath then
		warn("RtVS: Could not determine file path for deleted instance:", instance:GetFullName(), "- deletion will not sync")
		return
	end

	sendFileChange(filePath, "", "delete")

	-- Also delete the JSON file if it's a script with children
	if instance:IsA("LuaSourceContainer") and #instance:GetChildren() > 0 then
		local jsonPath = filePath:gsub("__main__%.lua$", "__main__.json")
		sendFileChange(jsonPath, "", "delete")
	end
end

-- Connection tracking
local connections = {}

-- Debounce: batch rapid property changes on the same instance into one update.
-- When applyProperties sets 5 properties, each fires Changed. Without debouncing
-- that's 5 HTTP POSTs; with debouncing it's 1 after a 200ms quiet period.
local pendingPropertyChanges = {} -- { [instanceFullName] = { instance, scheduledTick } }
local DEBOUNCE_DELAY = 0.2 -- 200ms

local function schedulePropertyChange(instance)
	pendingPropertyChanges[instance:GetFullName()] = {
		instance = instance,
		scheduledTick = tick() + DEBOUNCE_DELAY
	}
end

-- Background loop to flush debounced property changes
task.spawn(function()
	while true do
		task.wait(0.05)
		local now = tick()
		for fullName, entry in pairs(pendingPropertyChanges) do
			if now >= entry.scheduledTick then
				pendingPropertyChanges[fullName] = nil
				pcall(handlePropertyChanged, entry.instance)
			end
		end
	end
end)

-- Start watching a service
local function watchService(service)
	-- Watch for new descendants (at any depth)
	connections[#connections + 1] = service.DescendantAdded:Connect(function(descendant)
		handleInstanceAdded(descendant)
		watchDescendants(descendant)
	end)

	-- Watch for removed descendants (at any depth)
	-- Uses DescendantRemoving (not ChildRemoved) because it fires BEFORE
	-- the parent link is severed, so getInstanceFilePath can still walk the tree.
	connections[#connections + 1] = service.DescendantRemoving:Connect(function(descendant)
		handleInstanceRemoved(descendant)
	end)

	-- Watch existing descendants and seed their paths so deletion can find them
	for _, descendant in ipairs(service:GetDescendants()) do
		local filePath = getInstanceFilePath(descendant)
		if filePath then
			instancePaths[descendant] = filePath
		end
		watchDescendants(descendant)
	end
end

-- Watch a descendant for property changes and new children
function watchDescendants(instance)
	-- Watch property changes (debounced to batch rapid changes)
	connections[#connections + 1] = instance.Changed:Connect(function(_property)
		schedulePropertyChange(instance)
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
