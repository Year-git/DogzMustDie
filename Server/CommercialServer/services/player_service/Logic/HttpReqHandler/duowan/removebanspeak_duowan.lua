-- yy平台 解除禁言
local tonumber 		= tonumber
local now   		= _commonservice.now
local CHttpServer 	= RequireSingleton("CHttpServer")
local CCenter 		= RequireSingleton("CCenter")
local CDBService 	= RequireSingleton("CDBService")

local timeout = 5 * 50	-- 超时秒数

local function removebanspeak_duowan(req, method, query, reqbody)
	if reqbody.ts + timeout <= now(1) then
		return -1	-- 请求超时
	end
	local nWaitTime = 0
    local res = CDBService:UpdateBanspeakTime(reqbody.accounts, reqbody.server, nWaitTime)
    if res then
		res = CDBService:SelectRoleIDByPfIDAndServerID(reqbody.accounts, reqbody.server)
		if res and res[1] then
			CCenter:Send("CT_Banspeak", tonumber(reqbody.server), res[1].roleid, nWaitTime)
			return 1
		end
    end
    return -1
end

CHttpServer:RegisterHandler("/removebanspeak_duowan", removebanspeak_duowan)