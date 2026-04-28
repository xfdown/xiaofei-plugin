import lodash from 'lodash';
import fetch from 'node-fetch';
import fs from 'node:fs';
import { Plugin_Path } from '../components/index.js';

// 动态导入账号配置模块
let accountManager;
try {
	accountManager = await import('../../genshin/model/gsCfg.js');
} catch {
	accountManager = await import('../../genshin/model/gsCfg');
}

// ==================== 常量与配置 ====================
/** 游戏元数据配置 */
const GAME_META = {
	gs: {
		name: '原神',
		bizCN: 'hk4e_cn',
		bizGlobal: 'hk4e_global',
		serverList: ['cn_gf01', 'cn_qd01', 'os_usa', 'os_euro', 'os_asia', 'os_cht'],
		regionNameFilter: (name) => !['星穹列车', '无名客'].includes(name),
		isGlobal: (region) => region.includes('os_'),
	},
	sr: {
		name: '星穹铁道',
		bizCN: 'hkrpg_cn',
		bizGlobal: 'hkrpg_global',
		serverList: ['prod_gf_cn', 'prod_qd_cn', 'prod_official_usa', 'prod_official_euro', 'prod_official_asia', 'prod_official_cht'],
		regionNameFilter: (name) => ['星穹列车', '无名客'].includes(name),
		isGlobal: (region) => region.includes('prod_official') && !region.includes('prod_gf_cn'),
	},
	zzz: {
		name: '绝区零',
		bizCN: 'nap_cn',
		bizGlobal: 'nap_global',
		serverList: ['prod_gf_cn', 'prod_gf_cn', 'prod_gf_us', 'prod_gf_eu', 'prod_gf_jp', 'prod_gf_sg'],
		regionNameFilter: () => true, // 不过滤
		isGlobal: (region) => !region.includes('prod_gf_cn'),
	},
};

/** API 端点基础地址 */
const API_BASE = {
	CN: 'https://api-takumi.mihoyo.com',
	Global: 'https://sg-public-api.hoyoverse.com',
	gsCN: 'https://hk4e-api.mihoyo.com',
	gsGlobal: 'https://sg-hk4e-api.hoyoverse.com',
};

/** 活动接口配置 */
const ACTIVITY_APIS = {
	gsRegisterTime: '/event/e20240928anniversary/data',
	srRegisterTime: '/event/e20260426anniversary/data',
	zzzRegisterTime: '/event/e20250606anniversary/data',
	srArtSetRemain: '/event/e20260410artset/index',
};

// ==================== 通用工具函数 ====================
/**
 * 根据 UID 推断服务器区域代码
 */
function inferServerRegion(uid, gameKey) {
	const uidStr = String(uid);
	const gameMeta = GAME_META[gameKey];
	const serverList = gameMeta.serverList;

	if (gameKey === 'zzz') {
		if (uidStr.length < 10) return serverList[0];
		switch (uidStr.slice(0, -8)) {
			case '10': return serverList[2];
			case '15': return serverList[3];
			case '13': return serverList[4];
			case '17': return serverList[5];
			default: return serverList[0];
		}
	} else {
		switch (uidStr.slice(0, -8)) {
			case '5': return serverList[1];
			case '6': return serverList[2];
			case '7': return serverList[3];
			case '8':
			case '18': return serverList[4];
			case '9': return serverList[5];
			default: return serverList[0];
		}
	}
}

/**
 * 判断是否为国际服
 */
function isGlobalServer(region, gameKey) {
	return GAME_META[gameKey].isGlobal(region);
}

/**
 * 获取适用于当前账号的 API 基础地址
 */
function getApiBaseUrl(region, gameKey) {
	return isGlobalServer(region, gameKey) ? (API_BASE[`${gameKey}Global`] || API_BASE.Global) : (API_BASE[`${gameKey}CN`] || API_BASE.CN);
}

/**
 * 格式化时间戳为 YYYY/M/D HH:mm:ss
 */
function formatTimestamp(timestamp) {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');
	return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取当前时间字符串
 */
function getCurrentTimeString() {
	return formatTimestamp(Date.now());
}

/**
 * 从 fetch Response 中安全提取 Set-Cookie 数组
 * 兼容 node-fetch v2/v3 及原生 fetch
 */
function extractSetCookies(response) {
	const cookies = [];
	// node-fetch v2 提供 headers.raw()
	if (typeof response.headers.raw === 'function') {
		const raw = response.headers.raw();
		if (raw['set-cookie']) {
			raw['set-cookie'].forEach(c => cookies.push(c.split(';')[0]));
		}
	} else {
		// node-fetch v3 和原生 fetch 使用 headers.forEach
		response.headers.forEach((value, key) => {
			if (key.toLowerCase() === 'set-cookie') {
				cookies.push(value.split(';')[0]);
			}
		});
	}
	return cookies.filter(c => c.includes('='));
}

// ==================== 账号与 Cookie 管理 ====================
/**
 * 获取用户绑定的指定游戏的 Cookie 列表
 */
async function getUserBoundCookies(e, gameKey) {
	let boundCookies;
	try {
		boundCookies = accountManager.getBingCkSingle(e.user_id);
	} catch (err) {
		// 忽略错误，后续会使用 e.user 方式
	}

	const cookieList = [];

	// 优先使用插件框架提供的 user 对象
	if (e.user && lodash.isEmpty(boundCookies)) {
		const userObj = e.user;
		if (!userObj.hasCk) {
			return { code: -2, msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程' };
		}
		const uidList = userObj.getCkUidList(gameKey) || [];
		const mysUsers = userObj.mysUsers || {};
		for (const item of uidList) {
			if (!lodash.isEmpty(item)) {
				cookieList.push({
					uid: String(item.uid),
					...mysUsers[item.ltuid],
				});
			}
		}
	} else {
		if (lodash.isEmpty(boundCookies)) {
			return { code: -2, msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程' };
		}
		const filterFunc = GAME_META[gameKey].regionNameFilter;
		for (const uid in boundCookies) {
			const ck = boundCookies[uid];
			if (!lodash.isEmpty(ck) && filterFunc(ck.region_name)) {
				cookieList.push(ck);
			}
		}
	}

	if (cookieList.length === 0) {
		return { code: -1, msg: '获取Cookie失败！' };
	}
	return { code: 1, msg: '获取成功！', data: cookieList };
}

// ==================== 米哈游通行证登录 ====================
/**
 * 通过 badge 接口登录，获取 session cookies
 */
async function performBadgeLogin(account, uid, gameKey) {
	const meta = GAME_META[gameKey];
	const region = inferServerRegion(uid, gameKey);
	const isGlobal = isGlobalServer(region, gameKey);
	const apiBase = getApiBaseUrl(region, gameKey);
	const gameBiz = isGlobal ? meta.bizGlobal : meta.bizCN;

	const requestBody = {
		game_biz: gameBiz,
		lang: 'zh-cn',
		region: region,
		uid: String(uid),
	};

	let cookies = [];
	let code = -1;
	let message = '';
	let responseData = null;

	try {
		const response = await fetch(`${apiBase}/common/badge/v1/login/account`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: account.ck || '',
			},
			body: JSON.stringify(requestBody),
		});
		cookies = extractSetCookies(response);
		responseData = await response.json();
		code = responseData.retcode ?? -1;
		message = responseData.message;
	} catch (err) {
		message = `登录接口响应解析失败: ${err?.message || err}`;
	}

	return {
		code,
		message,
		cookies,
		userInfo: responseData?.data,
	};
}

// ==================== 注册时间查询功能 ====================
/**
 * 获取注册时间缓存文件路径
 */
function getRegisterTimeCachePath(userId, gameKey) {
	const dirName = gameKey === 'gs' ? 'ys' : gameKey;
	return `${Plugin_Path}/data/${dirName}_RegTime/${userId}.json`;
}

/**
 * 读取注册时间缓存
 */
function readRegisterTimeCache(filePath, uid) {
	try {
		if (fs.existsSync(filePath)) {
			const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
			return cache[uid] || null;
		}
	} catch (err) {
		// 忽略缓存读取错误
	}
	return null;
}

/**
 * 写入注册时间缓存
 */
function writeRegisterTimeCache(filePath, uid, data) {
	try {
		let cache = {};
		if (fs.existsSync(filePath)) {
			cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		}
		cache[uid] = data;
		const dir = filePath.substring(0, filePath.lastIndexOf('/'));
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(filePath, JSON.stringify(cache), 'utf8');
	} catch (err) {
		// 忽略写入错误
	}
}

/**
 * 请求注册时间原始数据
 */
async function fetchRegisterTimeRawData(uid, gameKey, loginResult) {
	const region = loginResult.userInfo.region;
	const apiBase = getApiBaseUrl(region, gameKey);
	const cookieHeader = loginResult.cookies.join('; ');
	const options = { headers: { Cookie: cookieHeader } };

	let url;
	switch (gameKey) {
		case 'gs':
			url = `${apiBase}${ACTIVITY_APIS.gsRegisterTime}?badge_uid=${uid}&badge_region=${region}&game_biz=${loginResult.userInfo.game_biz}&lang=zh-cn`;
			break;
		case 'sr':
			url = `${apiBase}${ACTIVITY_APIS.srRegisterTime}?badge_uid=${uid}&badge_region=${region}&game_biz=${loginResult.userInfo.game_biz}&lang=zh-cn&plat=2`;
			break;
		case 'zzz':
			url = `${apiBase}${ACTIVITY_APIS.zzzRegisterTime}?badge_uid=${uid}&badge_region=${region}&game_biz=${loginResult.userInfo.game_biz}&lang=zh-cn`;
			break;
		default:
			return { code: -1, msg: '未知游戏' };
	}

	const response = await fetch(url, options);
	const res = await response.json().catch(() => {
		return { retcode: -1 };
	});

	if (res.retcode !== 0) {
		return { code: -1, msg: res.message || '接口返回错误' };
	}

	// 提取原始数据
	let rawData;
	if (gameKey === 'gs') {
		rawData = res.data?.data;
	} else {
		rawData = res.data?.raw_data ? JSON.parse(res.data.raw_data) : {};
	}

	return {
		code: 1,
		rawData,
		userInfo: loginResult.userInfo,
		queryTime: Date.now(),
	};
}

/**
 * 从原始数据中解析注册时间
 */
function extractRegisterTime(rawData, gameKey) {
	if (gameKey === 'gs') {
		const dataObj = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
		const timestamp = dataObj['1'] || dataObj['1-1-1'];
		return timestamp > 0 ? formatTimestamp(timestamp * 1000) : (timestamp || '查询失败！');
	} else if (gameKey === 'sr') {
		const date = rawData['1-1'] || rawData['th_1_1_1'];
		if (date) {
			return date;
		} else if (rawData.data?.list) {
			const list = rawData.data?.list || [];
			const item = list.find(v => v.key === 'register_date');
			return item?.value || '查询失败！';
		}
	} else if (gameKey === 'zzz') {
		const timestamp = rawData['1'];
		return timestamp > 0 ? formatTimestamp(timestamp * 1000) : (timestamp || '查询失败！');
	}
	return '查询失败！';
}

/**
 * 获取注册时间数据（带缓存）
 */
async function getRegisterTimeWithCache(e, account, uid, gameKey) {
	const cachePath = getRegisterTimeCachePath(e.user_id, gameKey);
	let cached = readRegisterTimeCache(cachePath, uid);
	const shouldRefresh = e.msg.includes('刷新') || !cached;

	if (!shouldRefresh) {
		if (gameKey === 'gs' && cached?.game_data?.data?.data) cached.game_data = cached.game_data.data.data;
		return { code: 1, ...cached };
	}

	// 登录
	const loginRes = await performBadgeLogin(account, uid, gameKey);
	if (loginRes.code !== 0) {
		return { code: -1, msg: loginRes.message || '登录失败' };
	}

	// 获取数据
	const fetchRes = await fetchRegisterTimeRawData(uid, gameKey, loginRes);
	if (fetchRes.code !== 1) {
		return fetchRes;
	}

	const gameData = {
		game_data: fetchRes.rawData,
		info_data: fetchRes.userInfo,
		query_time: fetchRes.queryTime,
	};

	writeRegisterTimeCache(cachePath, uid, gameData);
	return { code: 1, ...gameData };
}

/**
 * 生成注册时间单账号回复文本
 */
async function buildRegisterTimeReply(e, account, uid, gameKey) {
	const result = await getRegisterTimeWithCache(e, account, uid, gameKey);
	if (result.code !== 1) {
		return `uid：${uid}\r\n注册时间：${result.msg || '查询失败'}`;
	}

	const user = result.info_data;
	const nickname = user.nickname;
	const level = user.level;
	const regionName = user.region_name;
	const regTime = extractRegisterTime(result.game_data, gameKey);
	const queryTime = formatTimestamp(result.query_time);

	return `uid：${nickname}(${uid})\r\n服务器：${regionName}\r\n冒险等级：${level}\r\n注册时间：${regTime}\r\n查询时间：${queryTime}`;
}

// ==================== 纪念册剩余查询功能 ====================
/**
 * 请求纪念册剩余数据
 */
async function fetchArtSetRemainData(uid, loginResult) {
	const region = loginResult.userInfo.region;
	const apiBase = getApiBaseUrl(region, 'sr');
	const cookieHeader = loginResult.cookies.join('; ');
	const url = `${apiBase}${ACTIVITY_APIS.srArtSetRemain}?channel=1&view_source=3&lang=zh-cn&badge_uid=${uid}&badge_region=${region}&game_biz=hkrpg_cn`;

	const response = await fetch(url, { headers: { Cookie: cookieHeader } });
	const res = await response.json();

	if (res.retcode !== 0) {
		return { code: -1, msg: res.message || '接口返回错误' };
	}
	return { code: 1, data: res.data };
}

/**
 * 生成纪念册剩余回复文本
 */
function buildArtSetRemainText(inventoryInfo) {
	const timeStr = getCurrentTimeString();
	return `贺礼：${inventoryInfo.first_stage_left}w/220w
抽奖：${inventoryInfo.second_stage_left}w/${15 + inventoryInfo.second_stage_extra_left}w(+${inventoryInfo.second_stage_extra_left}w)
互助：${inventoryInfo.share_draw_left}w/5w
时间：${timeStr}`;
}

// ==================== 插件主类 ====================
export class xiaofei_RegisterTimeQuery extends plugin {
	constructor() {
		super({
			name: '小飞插件_游戏注册时间查询',
			dsc: '查询原神/星铁/绝区零注册时间',
			event: 'message',
			priority: 2000,
			rule: [
				{
					reg: '^(#|\\*|\\%)?(星铁|绝区零)?(刷新)?(我的)?(原神|星铁|绝区零)?注册时间$',
					fnc: 'handleRegisterTimeQuery',
				},
				{
					reg: '^(#|\\*|\\%)?(星铁)?纪念册$',
					fnc: 'handleArtSetRemainQuery',
				},
			],
		});
	}

	/**
	 * 处理注册时间查询命令
	 */
	async handleRegisterTimeQuery() {
		// 解析游戏类型
		let gameKey = 'gs';
		if (this.e.msg.includes('*') || this.e.msg.includes('铁')) gameKey = 'sr';
		else if (this.e.msg.includes('%') || this.e.msg.includes('零')) gameKey = 'zzz';

		const gameName = GAME_META[gameKey].name;

		// 获取绑定账号
		const cookiesResult = await getUserBoundCookies(this.e, gameKey);
		if (cookiesResult.code !== 1) {
			await this.e.reply(cookiesResult.msg);
			return true;
		}

		const accountList = cookiesResult.data;
		const replyLines = [];
		for (const acc of accountList) {
			const line = await buildRegisterTimeReply(this.e, acc, acc.uid, gameKey);
			replyLines.push(line);
		}

		const finalReply = `---${gameName}注册时间---\r\n${replyLines.join('\r\n----------------\r\n')}\r\n----------------\r\n提示：如需更新数据，请发送【#刷新${gameName}注册时间】`;
		await this.e.reply(finalReply);
		return true;
	}

	/**
	 * 处理纪念册剩余数量查询命令
	 */
	async handleArtSetRemainQuery() {
		const gameKey = 'sr';
		const gameName = GAME_META[gameKey].name;

		const cookiesResult = await getUserBoundCookies(this.e, gameKey);
		if (cookiesResult.code !== 1) {
			await this.e.reply(cookiesResult.msg);
			return true;
		}

		const accountList = cookiesResult.data;
		if (accountList.length === 0) {
			await this.e.reply(`未找到有效的${gameName}绑定账号，请先绑定Cookie。`);
			return true;
		}

		const replyLines = [];
		for (const acc of accountList) {
			const uid = acc.uid;
			// 登录
			const loginRes = await performBadgeLogin(acc, uid, gameKey);
			if (loginRes.code !== 0) {
				continue;
			}

			// 获取数据
			const fetchRes = await fetchArtSetRemainData(uid, loginRes);
			if (fetchRes.code !== 1) {
				continue;
			}

			const line = buildArtSetRemainText(fetchRes.data.inventory_info);
			replyLines.push(line);
			break;
		}

		if (replyLines.length === 0) {
			replyLines.push("获取数据失败");
		}

		const finalReply = `---${gameName}纪念册剩余---\n${replyLines.join('\n----------------\n')}`;
		await this.e.reply(finalReply);
		return true;
	}
}