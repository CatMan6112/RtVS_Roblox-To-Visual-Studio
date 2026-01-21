-- RtVS Plugin: Main Entry Point
-- Handles bidirectional sync between Roblox Studio and file system
local VERSION = "1.0.1"

local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")

-- Load modules
local Deserializer = require(script.Parent.deserializer)
local StudioWatcher = require(script.Parent["studio-watcher"])

-- Server configuration
local SERVER_URL = "http://localhost:8080"
local POLL_INTERVAL = 2 -- Poll every 2 seconds
local PLUGIN_VERSION = "0.1.2"

-- Version check state
local versionMismatch = false

-- Sync mode state
local SYNC_MODE = {
	NONE = "none",
	PRIORITIZE_STUDIO = "prioritize_studio",
	PRIORITIZE_SERVER = "prioritize_server"
}

local currentMode = SYNC_MODE.NONE
local isPolling = false

-- Compare version strings (returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2)
local function compareVersions(v1, v2)
	local v1Parts = {}
	local v2Parts = {}

	for num in string.gmatch(v1, "%d+") do
		table.insert(v1Parts, tonumber(num))
	end

	for num in string.gmatch(v2, "%d+") do
		table.insert(v2Parts, tonumber(num))
	end

	for i = 1, math.max(#v1Parts, #v2Parts) do
		local part1 = v1Parts[i] or 0
		local part2 = v2Parts[i] or 0

		if part1 < part2 then
			return -1
		elseif part1 > part2 then
			return 1
		end
	end

	return 0
end

-- Test server connection and check version compatibility
local function testConnection()
	local success, response = pcall(function()
		return HttpService:GetAsync(SERVER_URL .. "/ping")
	end)

	if not success then
		warn("RtVS Server not running - start it with 'npm start' in /server")
		warn("    Error:", response)
		return false
	end

	-- Parse response to get server version
	local data = HttpService:JSONDecode(response)

	if not data or not data.version then
		warn("RtVS Server responded but version information is missing")
		return false
	end

	local serverVersion = data.version
	local versionComparison = compareVersions(PLUGIN_VERSION, serverVersion)

	if versionComparison < 0 then
		-- Plugin version is lower than server version
		warn("========================================")
		warn("OUTDATED PLUGIN")
		warn("========================================")
		warn("Outdated Plugin!! Please reinstall from GitHub:")
		warn("https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio")
		warn("")
		warn("Download RtVS.rbxm and place it in your Plugins folder:")
		warn("  Windows: %LOCALAPPDATA%\\Roblox\\Plugins\\")
		warn("  macOS: ~/Documents/Roblox/Plugins/")
		warn("")
		warn("Plugin functionality has been suspended.")
		warn("========================================")
		warn("Plugin Version: " .. PLUGIN_VERSION)
		warn("Server Version: " .. serverVersion)
		warn("========================================")
		versionMismatch = true
		return false
	elseif versionComparison > 0 then
		-- Plugin version is higher than server version
		warn("========================================")
		warn("OUTDATED SERVER")
		warn("========================================")
		warn("Outdated Server!! Please Update Via Github at")
		warn("https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio/!!")
		warn("Plugin Functionality has been Suspended!!")
		warn("========================================")
		warn("Plugin Version: " .. PLUGIN_VERSION)
		warn("Server Version: " .. serverVersion)
		warn("========================================")
		versionMismatch = true
		return false
	end

	-- Versions match
	print("RtVS Server connected (v" .. serverVersion .. ")")

	-- Check if there's a newer version available
	if data.latestVersion and data.latestVersion ~= PLUGIN_VERSION then
		local latestComparison = compareVersions(PLUGIN_VERSION, data.latestVersion)

		if latestComparison < 0 then
			-- Plugin is outdated
			warn("========================================")
			warn("UPDATE AVAILABLE")
			warn("========================================")
			warn("A new version of RtVS is available!")
			warn("Current Version: " .. PLUGIN_VERSION)
			warn("Latest Version:  " .. data.latestVersion)
			warn("")
			warn("Download the latest version from GitHub:")
			warn("https://github.com/CatMan6112/RtVS_Roblox-To-Visual-Studio")
			warn("")
			warn("Replace the plugin file in your Plugins folder:")
			warn("  Windows: %LOCALAPPDATA%\\Roblox\\Plugins\\")
			warn("  macOS: ~/Documents/Roblox/Plugins/")
			warn("========================================")
		end
	end

	versionMismatch = false
	return true
end

-- Close all open script editors to refresh them
-- This prevents users from being stuck in stale script editors when files change
local function closeAllScriptEditors()
	local success, error = pcall(function()
		-- Get all open script documents
		local documents = ScriptEditorService:GetScriptDocuments()

		for _, document in ipairs(documents) do
			-- Close the document
			pcall(function()
				document:CloseAsync()
			end)
		end

		if #documents > 0 then
			print("Closed", #documents, "script editors for refresh")
		end
	end)

	if not success then
		warn("Could not close script editors:", error)
	end
end

-- Poll server for file changes (Files → Studio)
local function pollForChanges()
	local success, response = pcall(function()
		return HttpService:GetAsync(SERVER_URL .. "/changes")
	end)

	if not success then
		-- Network error, silently fail and try again next poll
		return
	end

	-- Parse response
	local data = HttpService:JSONDecode(response)

	if not data or not data.changes then
		return
	end

	-- Apply each change
	if #data.changes > 0 then
		print("Received", #data.changes, "changes from server")

		-- Close all script editors before applying changes
		closeAllScriptEditors()

		for _, change in ipairs(data.changes) do
			local success, error = pcall(function()
				Deserializer.applyChange(change)
			end)

			if not success then
				warn("Failed to apply change:", error)
			end
		end

		print("Applied all changes")
	end
end

-- Start polling for file changes (Prioritize Server mode)
local function startPolling()
	if isPolling then
		print("Already polling for changes")
		return
	end

	isPolling = true
	print("Started polling for file changes (every " .. POLL_INTERVAL .. "s)")

	-- Use a simple loop with task.spawn
	task.spawn(function()
		while isPolling do
			pollForChanges()
			task.wait(POLL_INTERVAL)
		end
	end)
end

-- Stop polling for file changes
local function stopPolling()
	if not isPolling then
		return
	end

	isPolling = false
	print("Stopped polling for file changes")
end

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

-- List of common properties to read
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

-- Recursive function to serialize instance tree
local function serializeInstance(instance)
	local data = {
		ClassName = instance.ClassName,
		Name = instance.Name,
		Properties = getInstanceProperties(instance),
		Children = {}
	}

	for _, child in ipairs(instance:GetChildren()) do
		table.insert(data.Children, serializeInstance(child))
	end

	return data
end

-- Count total objects
local function countObjects(data)
	local count = 1
	for _, child in ipairs(data.Children) do
		count = count + countObjects(child)
	end
	return count
end

-- Send JSON data to server (Full sync)
local function sendToServer(jsonData)
	local success, response = pcall(function()
		return HttpService:PostAsync(
			SERVER_URL .. "/sync",
			jsonData,
			Enum.HttpContentType.ApplicationJson
		)
	end)

	if success then
		local responseData = HttpService:JSONDecode(response)
		print("Sync successful! Server wrote", responseData.filesWritten, "files")
		return true, responseData
	else
		warn("Sync failed:", response)
		return false, response
	end
end

-- Main function to read all game services and send to server
local function readAllServices()
	print("===== RtVS: Reading All Game Services =====")

	local success, result = pcall(function()
		local servicesToRead = {
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

		local gameData = {
			ClassName = "DataModel",
			Name = "Game",
			Services = {}
		}

		local totalObjects = 0
		for _, service in ipairs(servicesToRead) do
			local serviceData = serializeInstance(service)
			table.insert(gameData.Services, serviceData)
			totalObjects = totalObjects + countObjects(serviceData)
			print("Read " .. service.ClassName .. " (" .. countObjects(serviceData) .. " objects)")
		end

		local jsonData = HttpService:JSONEncode(gameData)
		print("Total objects processed: " .. totalObjects)
		print("")

		print("Sending data to server...")
		local syncSuccess, syncResponse = sendToServer(jsonData)

		if syncSuccess then
			print("Server sync complete!")
		else
			warn("Server sync failed")
		end

		return jsonData
	end)

	if not success then
		warn("Error reading game services:", result)
	else
		print("Successfully read all game services!")
	end
end

-- Enable "Prioritize Studio" mode
local function enablePrioritizeStudio()
	if versionMismatch then
		warn("Cannot enable Prioritize Studio mode: Version mismatch detected")
		return
	end

	if currentMode == SYNC_MODE.PRIORITIZE_STUDIO then
		print("Already in Prioritize Studio mode")
		return
	end

	-- Disable other mode first
	if currentMode == SYNC_MODE.PRIORITIZE_SERVER then
		stopPolling()
	end

	currentMode = SYNC_MODE.PRIORITIZE_STUDIO
	print("Prioritize Studio mode enabled")
	print("   Studio is now the source of truth")
	print("   Changes in Studio will be sent to the file system")

	-- Do an initial full sync
	readAllServices()

	-- Start watching for Studio changes
	StudioWatcher.start()
end

-- Disable "Prioritize Studio" mode
local function disablePrioritizeStudio()
	if currentMode ~= SYNC_MODE.PRIORITIZE_STUDIO then
		return
	end

	StudioWatcher.stop()
	currentMode = SYNC_MODE.NONE
	print("Prioritize Studio mode disabled")
end

-- Enable "Prioritize Server" mode
local function enablePrioritizeServer()
	if versionMismatch then
		warn("Cannot enable Prioritize Server mode: Version mismatch detected")
		return
	end

	if currentMode == SYNC_MODE.PRIORITIZE_SERVER then
		print("Already in Prioritize Server mode")
		return
	end

	-- Disable other mode first
	if currentMode == SYNC_MODE.PRIORITIZE_STUDIO then
		StudioWatcher.stop()
	end

	currentMode = SYNC_MODE.PRIORITIZE_SERVER
	print("Prioritize Server mode enabled")
	print("   File system is now the source of truth")
	print("   Changes in files will be applied to Studio")

	-- Start polling for file changes
	startPolling()
end

-- Disable "Prioritize Server" mode
local function disablePrioritizeServer()
	if currentMode ~= SYNC_MODE.PRIORITIZE_SERVER then
		return
	end

	stopPolling()
	currentMode = SYNC_MODE.NONE
	print("Prioritize Server mode disabled")
end

-- State for full sync confirmation
local fullSyncClickCount = 0
local lastFullSyncClick = 0

-- Function to perform full sync with double-click confirmation
local function performFullSync()
	if versionMismatch then
		warn("Cannot perform Full Sync: Version mismatch detected")
		return
	end

	local currentTime = tick()

	-- Reset if more than 3 seconds have passed
	if currentTime - lastFullSyncClick > 3 then
		fullSyncClickCount = 0
	end

	lastFullSyncClick = currentTime
	fullSyncClickCount = fullSyncClickCount + 1

	if fullSyncClickCount == 1 then
		print("========================================")
		print("FULL SYNC WARNING")
		print("========================================")
		print("This will OVERWRITE all files on the server!")
		print("Any unsynced changes will be PERMANENTLY LOST!")
		print("")
		print("STRONGLY RECOMMENDED: Commit to Git first!")
		print("")
		print("Click 'Full Sync' button AGAIN within 3 seconds to confirm")
		print("========================================")
	elseif fullSyncClickCount >= 2 then
		print("Starting Full Sync...")
		fullSyncClickCount = 0
		readAllServices()
		print("Full Sync complete!")
	end
end

-- Create toolbar and buttons
local toolbar = plugin:CreateToolbar("RtVS Sync")

local prioritizeStudioButton = toolbar:CreateButton(
	"Prioritize Studio",
	"Studio → Files: Studio is the source of truth, changes sync to files",
	"rbxassetid://4458901886"
)

local prioritizeServerButton = toolbar:CreateButton(
	"Prioritize Server",
	"Files → Studio: Files are the source of truth, changes sync to Studio",
	"rbxassetid://4458901886"
)

local fullSyncButton = toolbar:CreateButton(
	"Full Sync",
	"WARNING: Overwrite all server files with current Studio state (use with caution!)",
	"rbxassetid://4458901886"
)

-- Button click handlers
prioritizeStudioButton.Click:Connect(function()
	if currentMode == SYNC_MODE.PRIORITIZE_STUDIO then
		disablePrioritizeStudio()
		prioritizeStudioButton:SetActive(false)
	else
		enablePrioritizeStudio()
		prioritizeStudioButton:SetActive(true)
		prioritizeServerButton:SetActive(false)
	end
end)

prioritizeServerButton.Click:Connect(function()
	if currentMode == SYNC_MODE.PRIORITIZE_SERVER then
		disablePrioritizeServer()
		prioritizeServerButton:SetActive(false)
	else
		enablePrioritizeServer()
		prioritizeServerButton:SetActive(true)
		prioritizeStudioButton:SetActive(false)
	end
end)

fullSyncButton.Click:Connect(function()
	performFullSync()
end)

-- Plugin initialization
print("RtVS Plugin loaded!")
print("Testing server connection...")
if testConnection() then
	print("TIP: Use 'Prioritize Studio' to make Studio the source of truth")
	print("TIP: Use 'Prioritize Server' to make files the source of truth")
end
