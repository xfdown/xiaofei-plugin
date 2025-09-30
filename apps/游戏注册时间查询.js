﻿import lodash from 'lodash';
import fetch from 'node-fetch';
import fs from 'node:fs';
import { Plugin_Path } from '../components/index.js';
let gsCfg;
try {
	gsCfg = await import('../../genshin/model/gsCfg.js');
} catch {
	gsCfg = await import('../../genshin/model/gsCfg');
}

export class xiaofei_ys_QueryRegTime extends plugin {
	constructor() {
		super({
			/** 功能名称 */
			name: '小飞插件_游戏注册时间查询',
			/** 功能描述 */
			dsc: '通过官方活动接口获取游戏注册时间。',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^(#|\\*|\\%)?(星铁|绝区零)?(刷新)?(我的)?(原神|星铁|绝区零)?注册时间$',
					/** 执行方法 */
					fnc: 'regTime',
				},
			]
		});
	}

	async regTime() {
		let game = 'gs';
		let game_name = '原神';
		switch (true) {
			case (this.e.msg.indexOf('*') == 0 || this.e.msg.includes('铁')):
				game = 'sr';
				game_name = '星铁';
				break;
			case (this.e.msg.indexOf('%') == 0 || this.e.msg.includes('零')):
				game = 'zzz';
				game_name = '绝区零';
				break;
			default:
				game = 'gs';
				game_name = '原神';
				break;
		}
		let result = await mysck(this.e, game);
		if (result.code != 1) {
			await this.e.reply(result.msg);
			return true;
		}
		let ck_list = result.data || [];
		let query_list = [];
		let cookie = '';
		for (let ck of ck_list) {
			query_list.push(await reg_time(this.e, ck, ck.uid, game));
		}
		this.reply(`---${game_name}注册时间---\r\n${query_list.join('\r\n----------------\r\n')}\r\n----------------\r\n提示：如需更新数据，请发送【#刷新${game_name}注册时间】`);
		return true;
	}
}


async function reg_time(e, ck, uid, game = 'gs') {
	let result = await get_game_data(e, ck, uid, game);
	if (result?.code == 1 && result.info_data && result.game_data) {
		let level = result.info_data.level;
		let nickname = result.info_data.nickname;
		let region_name = result.info_data.region_name;
		let data;
		let reg_time = '查询失败！';
		switch (game) {
			case 'gs':
				data = result.game_data.data?.data;
				data = data ? JSON.parse(data) : {};
				reg_time = data['1'] || data['1-1-1'];
				if (reg_time > 0) {
					reg_time = new Date(reg_time * 1000 + 28800000).toJSON().split('T').join(' ').split('.')[0];
				}
				break;
			case 'sr':
				if (result.game_data['1-1']) {
					reg_time = result.game_data['1-1'];
				} else {
					let list = result.game_data.data?.list || [];
					data = list.find(val => {
						return val.key == 'register_date'
					}) || {};
					if (data.value) {
						reg_time = data.value;
					}
				}
				break;
			case 'zzz':
				reg_time = result.game_data['1'];
				if (reg_time > 0) {
					reg_time = new Date(reg_time * 1000 + 28800000).toJSON().split('T').join(' ').split('.')[0];
				}
				break;
		}


		let query_time = new Date(result.query_time + 28800000).toJSON().split('T').join(' ').split('.')[0];
		return `uid：${nickname}(${uid})\r\n服务器：${region_name}\r\n冒险等级：${level}\r\n注册时间：${reg_time}\r\n查询时间：${query_time}`;
	}
	let msg = result.msg;
	msg = msg ? msg : '查询失败！';
	return `uid：${uid}\r\n注册时间：${msg}`;
}

async function get_game_data(e, ck, uid, game = 'gs') {
	let msg = '';
	let game_data = null;
	let temp_data = null;
	const temp_dir = `${Plugin_Path}/data/${game == 'gs' ? 'ys' : game}_RegTime`;
	if (!fs.existsSync(temp_dir)) {
		fs.mkdirSync(temp_dir, { recursive: true });
	}
	const temp_file = `${temp_dir}/${e.user_id}.json`;
	try {
		if (fs.existsSync(temp_file)) {
			temp_data = JSON.parse(fs.readFileSync(temp_file, 'utf8'));
		}
	} catch (err) { }

	if (temp_data && temp_data[uid] && temp_data[uid].game_data && temp_data[uid].info_data && !e.msg.includes('刷新')) {
		game_data = temp_data[uid];
	}

	if (!game_data || (new Date().getTime() - game_data.query_time) > (1000 * 60 * 60 * 6) || e.msg.includes('刷新')) {
		let result = await update_game_data(ck, uid, game);
		if (result.code == 1 && result.data) {
			try {
				let save_data = temp_data ? temp_data : {};
				save_data[uid] = result.data;
				fs.writeFileSync(temp_file, JSON.stringify(save_data), 'utf8');
			} catch (err) { }
			game_data = result.data;
		} else {
			msg = result.msg;
		}
	}

	if (game_data) {
		return { code: 1, msg: msg, ...game_data };
	}
	msg = msg ? msg : '查询失败！';
	return { code: -1, msg: msg };
}

async function update_game_data(ck, uid, game = 'gs') {
	let msg = '';
	let result = await hk4e_cn_login(ck, uid, game);
	if (result.code === 0) {
		let info_data = result.data.data?.data; info_data = info_data ? info_data : null;
		let options = {
			method: 'GET',
			headers: {
				'Cookie': result.data.cookies.join('; ')
			}
		};

		let api = 'https://hk4e-api.mihoyo.com';
		let region = info_data.region || '';
		if (region.includes('os_')) {
			api = 'https://sg-hk4e-api.hoyoverse.com';
		}

		let url;
		let response;
		switch (game) {
			case 'gs':
				url = `${api}/event/e20240928anniversary/data?badge_uid=${uid}&badge_region=${info_data.region}&lang=zh-cn&game_biz=${info_data.game_biz}`;
				response = await fetch(url, options);
				try {
					let res = await response.json();
					let data = res.data?.data;
					if (info_data && data) {
						return {
							code: 1,
							msg: msg,
							data: { game_data: res, info_data: info_data, query_time: new Date().getTime() }
						};
					} else {
						msg = res.message;
					}
				} catch (err) { }
				break;
			case 'sr':
				api = region.includes('prod_official') ? 'https://sg-public-api.hoyoverse.com' : 'https://api-takumi.mihoyo.com';
				url = `${api}/event/e20240426anniversary/data?plat=2&lang=zh-cn&badge_uid=${uid}&badge_region=${info_data.region}&game_biz=${info_data.game_biz}`;
				response = await fetch(url, options);
				try {
					let res = await response.json();
					let data = res?.data;
					if (info_data && data) {
						return {
							code: 1,
							msg: msg,
							data: { game_data: JSON.parse(data?.raw_data || {}), info_data: info_data, query_time: new Date().getTime() }
						};
					} else {
						msg = res.message;
					}
				} catch (err) { }
				break;
			case 'zzz':
				api = !region.includes('prod_gf_cn') ? 'https://sg-public-api.hoyoverse.com' : 'https://api-takumi.mihoyo.com';
				url = `${api}/event/e20250606anniversary/data?badge_uid=${uid}&badge_region=${info_data.region}&game_biz=${info_data.game_biz}&lang=zh-cn`;
				response = await fetch(url, options);
				try {
					let res = await response.json();
					let data = res?.data;
					if (info_data && data) {
						return {
							code: 1,
							msg: msg,
							data: { game_data: JSON.parse(data?.raw_data || {}), info_data: info_data, query_time: new Date().getTime() }
						};
					} else {
						msg = res.message;
					}
				} catch (err) { }
				break;
		}
	} else {
		msg = result.msg;
	}
	msg = msg ? msg : '查询失败！';
	return { code: -1, msg: msg };
}

async function hk4e_cn_login(ck, uid, game = 'gs') {
	let api = 'https://api-takumi.mihoyo.com';
	let body = { "game_biz": "hk4e_cn", "lang": "zh-cn", "region": "cn_gf01", "uid": "" };
	body['region'] = getServer(uid, game);
	body['uid'] = uid;
	switch (game) {
		case 'gs':
			if (body['region'].includes('os_')) {
				body['game_biz'] = 'hk4e_global';
				api = 'https://sg-public-api.hoyoverse.com';
			}
			break;
		case 'sr':
			body['game_biz'] = 'hkrpg_cn'
			if (body['region'].includes('prod_official')) {
				body['game_biz'] = 'hkrpg_global';
				api = 'https://sg-public-api.hoyoverse.com';
			}
			break;
		case 'zzz':
			body['game_biz'] = 'nap_cn';
			if (!body['region'].includes('prod_gf_cn')) {
				body['game_biz'] = 'nap_global';
				api = 'https://sg-public-api.hoyoverse.com';
			}
			break;
	}
	let options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': ck.ck || ''
		},
		body: JSON.stringify(body)
	};

	let url = `${api}/common/badge/v1/login/account`;
	let response = await fetch(url, options);

	let cookies = [];
	let code = -1;
	let msg = '';
	let result = null;
	try {
		const headers = response.headers;
		const SetCookie = headers.getSetCookie ? headers.getSetCookie() : headers.raw()['set-cookie'];
		cookies = SetCookie
			.map(cookie => cookie.split(';')?.[0])
			.filter(cookie => cookie.split('=')?.[1]);
		let res = await response.json();
		result = { cookies: cookies, data: res };
		code = res.retcode ?? code;
		msg = res.message;
	} catch (err) { }
	return { code: code, msg: msg, data: result };
}

async function mysck(e, game = 'gs') {
	let cks;
	let list = [];
	try {
		cks = gsCfg.getBingCkSingle(e.user_id);
	} catch (err) { }
	if (e.user && lodash.isEmpty(cks)) {
		let NoteUser = e.user;
		let mysUsers = NoteUser.mysUsers || {}
		if (!NoteUser.hasCk) {
			return { code: -2, msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程' };
		}
		for (let val of NoteUser.getCkUidList(game) || []) {
			if (!lodash.isEmpty(val)) {
				list.push({
					uid: String(val.uid),
					...mysUsers[val.ltuid]
				});
			}
		}
	} else {
		if (lodash.isEmpty(cks)) {
			return { code: -2, msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程' };
		}
		for (let uid in cks) {
			let ck = cks[uid];
			if (!lodash.isEmpty(ck)) {
				if (game == 'gs' && !['星穹列车', '无名客'].includes(ck.region_name)) {
					list.push(ck);
				} else if (geme == 'sr' && ['星穹列车', '无名客'].includes(ck.region_name)) {
					list.push(ck);
				}
			}
		}
	}
	if (list.length < 1) {
		return { code: -1, msg: '获取Cookie失败！' };
	}
	return { code: 1, msg: '获取成功！', data: list };
}

const game_region = {
	gs: ["cn_gf01", "cn_qd01", "os_usa", "os_euro", "os_asia", "os_cht"],
	sr: [
		"prod_gf_cn",
		"prod_qd_cn",
		"prod_official_usa",
		"prod_official_euro",
		"prod_official_asia",
		"prod_official_cht",
	],
	zzz: ["prod_gf_cn", "prod_gf_cn", "prod_gf_us", "prod_gf_eu", "prod_gf_jp", "prod_gf_sg"],
}

function getServer(uid, game) {
	const _uid = String(uid)
	if (game == "zzz") {
		if (_uid.length < 10) {
			return game_region[game][0] // 官服
		}

		switch (_uid.slice(0, -8)) {
			case "10":
				return game_region[game][2] // 美服
			case "15":
				return game_region[game][3] // 欧服
			case "13":
				return game_region[game][4] // 亚服
			case "17":
				return game_region[game][5] // 港澳台服
		}
	} else {
		switch (_uid.slice(0, -8)) {
			case "5":
				return game_region[game][1] // B服
			case "6":
				return game_region[game][2] // 美服
			case "7":
				return game_region[game][3] // 欧服
			case "8":
			case "18":
				return game_region[game][4] // 亚服
			case "9":
				return game_region[game][5] // 港澳台服
		}
	}
	return game_region[game][0] // 官服
}