import plugin from '../../../lib/plugins/plugin.js'
import fetch from "node-fetch";
import { core } from "oicq";
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { Config, Data, Version, Plugin_Path } from '../components/index.js'
import uploadRecord from '../model/uploadRecord.js'
import { segment } from "oicq";
import ArkMsg from '../model/ArkMsg.js'
import fs from 'fs'
import md5 from 'md5'
const no_pic = '';
var _page_size = 20;

var music_cookies = {
	qqmusic: {
		get ck() {
			try {
				let data = Config.getConfig('music', 'cookies');
				if (data?.qqmusic) {
					return getCookieMap(data?.qqmusic);
				}
			} catch (err) { }
			return null;
		},
		set ck(cookies) {
			try {
				if (typeof (cookies) == 'object') {
					try {
						let cks = [];
						for (let key of cookies.keys()) {
							let value = cookies.get(key);
							if (value) {
								cks.push(`${key}=${value}`);
							}
						}
						cookies = cks.join('; ');
					} catch (err) { }
				}
				let data = Config.getConfig('music', 'cookies');
				data = data ? data : {};
				data.qqmusic = cookies;
				Config.saveConfig('music', 'cookies', data);
				return;
			} catch (err) {
				logger.error(err);
			}
			return;
		},
		body: {
			comm: {
				"_channelid": "19",
				"_os_version": "6.2.9200-2",
				"authst": "",
				"ct": "19",
				"cv": "1891",
				"guid": md5(String(new Date().getTime())),
				"patch": "118",
				"psrf_access_token_expiresAt": 0,
				"psrf_qqaccess_token": "",
				"psrf_qqopenid": "",
				"psrf_qqunionid": "",
				"tmeAppID": "qqmusic",
				"tmeLoginType": 2,
				"uin": "0",
				"wid": "0"
			}
		},
		init: false,
		update_time: 0
	},
	netease: {
		get ck() {
			try {
				let data = Config.getConfig('music', 'cookies');
				if (data?.netease) {
					return data?.netease;
				}
			} catch (err) { }
			return '';
		},
		set ck(cookies) {
			try {
				let data = Config.getConfig('music', 'cookies');
				data = data ? data : {};
				data.netease = cookies;
				Config.saveConfig('music', 'cookies', data);
				return;
			} catch (err) {
				logger.error(err);
			}
			return;
		}
	}
};

const music_reg = '^#?(??????)?(qq|QQ|??????|??????????|??????|??????|??????)?(qq|QQ|??????|??????????|??????|??????|??????)?(????????????|??????|??????|??????|??????????|??????????|?????????|????????????|????????????|??????30???|??????|????????????|???????????????)(.*)$';
export class xiaofei_music extends plugin {
	constructor() {
		super({
			/** ???????????? */
			name: '????????????_??????',
			/** ???????????? */
			dsc: '',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** ???????????????????????????????????? */
			priority: 2000,
			rule: [
				{
					/** ?????????????????? */
					reg: '^#?(??????|??????)(ck|cookie)(??????|??????)$',
					/** ???????????? */
					fnc: 'music_ck_check',
					permission: 'master'
				},
				{
					/** ?????????????????? */
					reg: '^#???????(??????|??????)ck.*$',
					/** ???????????? */
					fnc: 'submit_music_ck',
					permission: 'master'
				},
				{
					/** ?????????????????? */
					reg: music_reg,
					/** ???????????? */
					fnc: 'music'
				}
			]
		});

		try {
			let setting = Config.getdefSet('setting', 'system') || {};
			this.priority = setting['music'] == true ? 10 : 2000;
		} catch (err) { }

		this.task = [
			{
				cron: '*/10 * * * * ?',
				name: '[????????????_??????]????????????',
				fnc: this.music_task,
				log: false
			}
		];
	}

	async init() {
		try {
			for (let key in music_cookies) {
				let ck = music_cookies[key].ck;
				if (key == 'netease' && (!ck || ck?.includes('MUSIC_U=;'))) {
					logger.info(`???????????????_???????????????ck???????????????????????????ck???`);
				}
			}
			await update_qqmusic_ck();
		} catch (err) { }

		try {
			let path = `${process.cwd()}/data/html/xiaofei-plugin/music_list`;
			let files = fs.readdirSync(path);
			files.forEach(file => {
				fs.unlink(`${path}/${file}`, err => { });
			});
		} catch (err) { }
	}

	async music_task() {
		let data = xiaofei_plugin.music_temp_data;
		for (let key in data) {
			if ((new Date().getTime() - data[key].time) > (1000 * 60)) {
				let temp = data[key];
				delete data[key];
				await recallMusicMsg(key, temp.msg_results);
			}
		}
		try {
			await update_qqmusic_ck();
		} catch (err) {
			logger.error(err);
		}
	}

	async music() {
		return music_message(this.e);
	}

	/** ???????????????????????????????????? */
	accept() {
		if (/^#?(????????????|??????????????????|????????????|??????|????????????|??????|????????????)?(\d+)?$/.test(this.e.msg)) {
			music_message(this.e);
		}
		return;
	}

	async music_ck_check(e) {
		let msgs = [];
		let list = [
			{
				name: 'QQ??????',
				ck: (music_cookies.qqmusic.ck && music_cookies.qqmusic.ck.get('qqmusic_key')),
				user_info: get_qqmusic_userinfo
			}, {
				name: '???????????????',
				ck: !music_cookies.netease.ck?.includes('MUSIC_U=;'),
				user_info: get_netease_userinfo
			}
		];
		for (let val of list) {
			msgs.push(`---${val.name}---`);
			if (!val.ck) {
				msgs.push(`??????????????????ck`);
			} else {
				let result = await val.user_info();
				if (result.code == 1) {
					let data = result.data;
					let userid = String(data.userid);
					if (e.isGroup) {
						userid = userid.length > 5 ? `${userid.substring(0, 3)}***${userid.substring(userid.length - 3)}` : `${userid.substring(0, 1)}**${userid.substring(userid.length - 1)}`;
					}
					msgs.push(`?????????${data.nickname}[${userid}]`);
					msgs.push(`?????????ck????????????`);
					msgs.push(`??????VIP???${data.is_vip ? '???' : '???'}`);
				} else {
					msgs.push(`?????????ck?????????`);
				}
			}
		}
		let MsgList = [];
		let user_info = {
			nickname: Bot.nickname,
			user_id: Bot.uin
		};
		MsgList.push({
			...user_info,
			message: `---??????ck??????---\n${msgs.join('\n')}`
		});
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await e.reply(forwardMsg);
		return true;
	}
	async submit_music_ck(e) {
		let reg = /^#???????(??????|??????)ck(.*)$/.exec(e.msg);
		if (reg) {
			let cookies;
			try {
				cookies = getCookieMap(reg[2].replace(/'/g, '').replace(/"/g, ''));
				if (cookies.get('MUSIC_U')) {
					let netease_cookies = `MUSIC_U=${cookies.get('MUSIC_U')};`;
					let result = await get_netease_userinfo(netease_cookies);
					if (result.code != 1) {
						await e.reply(`???????????????ck??????????????????????????????????????????`);
						return true;
					}
					music_cookies.netease.ck = netease_cookies;
					let data = result.data;
					await e.reply(`???????????????ck???????????????\n?????????${data.nickname}[${data.userid}]\n??????VIP???${data.is_vip ? '???' : '???'}`);
					return true;
				} else if (cookies.get('wxunionid') || cookies.get('psrf_qqunionid')) {
					let result = await get_qqmusic_userinfo(cookies);
					if (result.code != 1) {
						await e.reply(`QQ??????ck??????????????????????????????????????????`);
						return true;
					}
					cookies.set('psrf_musickey_createtime', 0);
					music_cookies.qqmusic.ck = cookies;
					music_cookies.qqmusic.update_time = 0;
					try {
						update_qqmusic_ck();
					} catch (err) { }
					let data = result.data;
					await e.reply(`QQ??????ck???????????????\n?????????${data.nickname}[${data.userid}]\n??????VIP???${data.is_vip ? '???' : '???'}`);
					return true;
				}
			} catch (err) {
				await e.reply(`ck?????????????????????????????????????????????`);
			}
		}

		let MsgList = [];
		let user_info = {
			nickname: Bot.nickname,
			user_id: Bot.uin
		};

		let msgs = ['?????????#????????????ck+??????ck'];
		msgs.push(`---QQ??????ck??????---`);
		msgs.push(`????????????http://y.qq.com/ ????????????ck???`);
		msgs.push(`QQ?????????????????????uin=; psrf_qqopenid=; psrf_qqunionid=; psrf_qqrefresh_token=;`);
		msgs.push(`???????????????????????????wxuin=; wxopenid=; wxunionid=; wxrefresh_token=;`);
		msgs.push(`---???????????????ck??????---`);
		msgs.push(`????????????http://music.163.com/ ????????????ck???`);
		msgs.push(`???????????????MUSIC_U=;`);
		msgs.push(`??????????????????ck?????????HttpOnly???????????????????????????????????????????????????Via????????????"??????Cookies"??????????????????pc???????????????????????????????????????????????????`);
		msgs.push(`--------------------`);
		msgs.push(`Via??????????????????https://www.viayoo.com/`);

		MsgList.push({
			...user_info,
			message: `---????????????ck??????---\n${msgs.join('\n')}`
		});
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await e.reply(forwardMsg);
		return true;
	}
}

if (!xiaofei_plugin.music_temp_data) {
	xiaofei_plugin.music_temp_data = {};
}

if (!xiaofei_plugin.music_poke_cd) {
	xiaofei_plugin.music_poke_cd = {};
}

if (xiaofei_plugin.music_guild) Bot.off('guild.message', xiaofei_plugin.music_guild);
xiaofei_plugin.music_guild = async (e) => {//??????????????????
	e.msg = e.raw_message;
	if (RegExp(music_reg).test(e.msg) || /^#?(????????????|??????????????????|????????????|??????|????????????|??????|????????????)?(\d+)?$/.test(e.msg)) {
		music_message(e);
	}
};
Bot.on('guild.message', xiaofei_plugin.music_guild);

if (xiaofei_plugin.music_notice) Bot.off('notice', xiaofei_plugin.music_notice);
xiaofei_plugin.music_notice = async (e) => {//????????????
	if (e?.sub_type != 'poke' || e.target_id != Bot.uin) return;
	e.user_id = e.operator_id;
	let key = get_MusicListId(e);
	let time = xiaofei_plugin.music_poke_cd[key] || 0;
	if ((new Date().getTime() - time) < 8000) return;
	xiaofei_plugin.music_poke_cd[key] = new Date().getTime();
	let setting = Config.getdefSet('setting', 'system') || {};
	if (setting['poke'] != true) return;
	e.msg = '#???????????????';
	if (await music_message(e)) return;
}
Bot.on('notice', xiaofei_plugin.music_notice);

async function update_qqmusic_ck() {
	try {
		let update_time = music_cookies.qqmusic.update_time;
		if ((new Date().getTime() - update_time) < (1000 * 60 * 10)) {
			return;
		}
		music_cookies.qqmusic.update_time = new Date().getTime();
		let type = -1;//QQ:0,??????:1
		let ck_map = music_cookies.qqmusic.ck || new Map();
		if (ck_map.get('wxunionid')) {
			type = 1;
		} else if (ck_map.get('psrf_qqunionid')) {
			type = 0;
		} else {
			if (!music_cookies.qqmusic.init) {
				music_cookies.qqmusic.init = true;
				logger.info(`???????????????_QQ??????ck????????????QQ??????ck???`);
			}
			return;
		}
		let authst = ck_map.get('music_key') || ck_map.get('qm_keyst');
		let psrf_musickey_createtime = Number(ck_map.get("psrf_musickey_createtime") || 0) * 1000;
		let refresh_num = Number(ck_map.get("refresh_num") || 0);
		if (((new Date().getTime() - psrf_musickey_createtime) > (1000 * 60 * 60 * 12) || !authst) && refresh_num < 3) {
			let result = await qqmusic_refresh_token(ck_map, type);
			if (result.code == 1) {
				ck_map = result.data;
				logger.info(`???????????????_QQ??????ck???????????????`);
			} else {
				ck_map.set("refresh_num", refresh_num + 1);
				music_cookies.qqmusic.init = false;
				logger.error(`???????????????_QQ??????ck??????????????????`);
			}
			music_cookies.qqmusic.ck = ck_map;
			authst = ck_map.get('qqmusic_key') || ck_map.get('qm_keyst');
		} else if (refresh_num > 2) {
			if (!music_cookies.qqmusic.init) {
				music_cookies.qqmusic.init = true;
				logger.error(`???????????????_QQ??????ck???ck????????????`);
			}
		}
		let comm = music_cookies.qqmusic.body.comm;
		if (type == 0) comm.uin = ck_map.get('uin') || '', comm.psrf_qqunionid = ck_map.get('psrf_qqunionid') || '';
		if (type == 1) comm.wid = ck_map.get('wxuin') || '', comm.psrf_qqunionid = ck_map.get('wxunionid') || '';
		comm.tmeLoginType = Number(ck_map.get('tmeLoginType') || '2');
		comm.authst = authst || '';
		comm.guid = md5(String(comm.authst + comm.uin + comm.wid));
	} catch (err) {
		logger.error(err);
	}
}

async function recallMusicMsg(key, msg_results) {
	if (msg_results && msg_results.length > 0) {
		for (let msg_result of msg_results) {
			let arr = key.split('_');
			let type = arr[0];
			for (let val of msg_result) {
				try {
					val = await val;
					let message_id = (await val?.message)?.message_id || val?.message_id;
					switch (type) {
						case 'group':
							await Bot.pickGroup(arr[1]).recallMsg(message_id);
							break;
						case 'friend':
							await Bot.pickFriend(arr[1]).recallMsg(message_id);
							break;
					}
				} catch (err) {
					logger.error(err);
				}
			}
		}
	}
}

async function music_message(e) {
	let reg = /^#?(????????????|??????????????????|????????????|??????|????????????|??????|????????????)?(\d+)?$/.exec(e.msg);
	if (reg) {
		if (e.source && (reg[1]?.includes('??????') || reg[1]?.includes('????????????'))) {
			let source;
			if (e.isGroup) {
				source = (await e.group.getChatHistory(e.source.seq, 1)).pop();
			} else {
				source = (await e.friend.getChatHistory(e.source.time, 1)).pop();
			}
			if (source && source['message'][0]['type'] == 'json') {
				try {
					let music_json = JSON.parse(source['message'][0]['data']);
					if (music_json['view'] == 'music') {
						let music = music_json.meta.music;

						if (reg[1]?.includes('????????????')) {
							music.title = music.title + '-' + music.desc;
							music.desc = '???????????????';
							music.jumpUrl = music.musicUrl;
							music_json.view = 'news';
							music_json.meta.news = music;
							delete music_json.meta.music;
							await ArkMsg.Share(JSON.stringify(music_json), e);
							return true;
						}

						await e.reply('????????????[' + music.title + '-' + music.desc + ']?????????');
						let result = await e.reply(await uploadRecord(music.musicUrl, 0, !reg[1].includes('??????')));
						if (!result) {
							result = '??????[' + music.title + '-' + music.desc + ']?????????\n' + music.musicUrl;
							await e.reply(result);
							return true;
						}
						if (reg[1].includes('??????') && result) {
							try {
								let message = await Bot.getMsg(result.message_id);
								if (Array.isArray(message.message)) message.message.push({ type: 'text', text: '[??????]' });
								(e.group || e.friend)?.sendMsg('PCQQ????????????????????????????????????????????????', message);
							} catch (err) { }
						}
					}
				} catch (err) { }
				return true;
			}
		}

		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data[key];
		if (!data || (new Date().getTime() - data.time) > (1000 * 60)) {
			return false;
		}

		if ((reg[1]?.includes('??????') || reg[1]?.includes('??????') || reg[1]?.includes('????????????')) && !reg[2]) {
			reg[2] = String((data.index + 1) + data.start_index);
		}

		let index = (Number(reg[2]) - 1) - data.start_index;

		if (data.data.length > index && index > -1) {
			if (data.data.length < 2 && !reg[1]?.includes('??????') && !reg[1]?.includes('??????') && !reg[1]?.includes('????????????')) {
				return false;
			}
			data.index = index;
			let music = data.data[index];

			if (!reg[1]?.includes('??????')) {
				let music_json = await CreateMusicShareJSON(music);
				if (reg[1] && (reg[1].includes('??????') || reg[1]?.includes('????????????'))) {
					if (!music_json.meta.music || !music_json.meta.music?.musicUrl) {
						await e.reply('[' + music.name + '-' + music.artist + ']???????????????????????????');
						return true;
					}

					if (reg[1]?.includes('????????????')) {
						music_json.meta.music.title = music.name + '-' + music.artist;
						music_json.meta.music.desc = '???????????????';
						music_json.meta.music.jumpUrl = music_json.meta.music.musicUrl;
						music_json.view = 'news';
						music_json.meta.news = music_json.meta.music;
						delete music_json.meta.music;
						await ArkMsg.Share(JSON.stringify(music_json), e);
						return true;
					}

					await e.reply('????????????[' + music.name + '-' + music.artist + ']?????????');
					let result = await uploadRecord(music_json.meta.music.musicUrl, 0, !reg[1].includes('??????'));
					if (!result) {
						result = '??????[' + music.name + '-' + music.artist + ']?????????\n' + music_json.meta.music.musicUrl;
						await e.reply(result);
						return true;
					}
					result = await e.reply(result);
					if (reg[1].includes('??????') && result) {
						try {
							let message = await Bot.getMsg(result.message_id);
							if (Array.isArray(message.message)) message.message.push({ type: 'text', text: '[??????]' });
							(e.group || e.friend)?.sendMsg('PCQQ????????????????????????????????????????????????', message);
						} catch (err) { }
					}
					return true;
				}

				let ArkSend = await ArkMsg.Share(JSON.stringify(music_json), e);
				if (ArkSend.code != 1) {
					let body = await CreateMusicShare(e, music);
					await SendMusicShare(body);
				}
			} else {
				try {
					typeof (music.lrc) == 'function' ? music.lrc = await music.lrc(music.data) : music.lrc = music.lrc;
					if (music.lrc == null && typeof (music.api) == 'function') {
						await music.api(music.data, ['lrc'], music);
					}
				} catch (err) { }

				let lrcs = music.lrc || '????????????????????????????????????';
				if (!Array.isArray(lrcs)) lrcs = [lrcs];

				let user_info = {
					nickname: Bot.nickname,
					user_id: Bot.uin
				};
				let MsgList = [];

				for (let lrc of lrcs) {
					let lrc_text = [];
					let lrc_reg = /\[.*\](.*)?/gm;
					let exec;
					while (exec = lrc_reg.exec(lrc)) {
						if (exec[1]) {
							lrc_text.push(exec[1]);
						}
					}
					if (lrc_text.length > 0) {
						MsgList.push({
							...user_info,
							message: `---${music.name}-${music.artist}---\n${lrc_text.join('\n')}`
						});
					}

					MsgList.push({
						...user_info,
						message: `---${music.name}-${music.artist}---\n${lrc}`
					});
				}
				let forwardMsg = await Bot.makeForwardMsg(MsgList);
				await e.reply(forwardMsg);
			}

			return true;
		}
		return false;
	}

	reg = RegExp(music_reg).exec(e.msg);
	let search = reg[5];
	let source = '';
	if (!reg[2]) reg[2] = '';
	if (!reg[3]) reg[3] = '';

	let music_source = {
		'??????': 'netease',
		'?????????': 'netease',
		'??????': 'kuwo',
		'??????': 'kugou',
		'QQ': 'qq',
		'qq': 'qq'
	};

	if (music_source[reg[2]]) {
		let source = reg[2];
		reg[2] = reg[3];
		reg[3] = source;
	}


	let setting = Config.getdefSet('setting', 'system') || {};
	source = music_source[reg[3]] || (music_source[setting['music_source']] || 'qq');

	try {
		let arr = Object.entries(music_source);
		let index = Object.values(music_source).indexOf(source);
		reg[3] = arr[index][0] || reg[3];
	} catch (err) { }

	source = [source, reg[3]];

	if (search == '' && reg[4] != '?????????' && reg[4] != '????????????' && reg[4] != '????????????' && reg[4] != '??????30???' && reg[4] != '??????' && !((reg[4] == '??????' || reg[4] == '??????') && search == '???') && reg[4] != '????????????' && reg[4] != '???????????????') {
		let help = "------????????????------\r\n?????????#?????? #????????????\r\n?????????QQ???????????????????????????\r\n?????????#QQ?????? #??????QQ??????"
		await e.reply(help, true);
		return true;
	}

	if (setting['is_list'] == true) reg[2] = '??????';

	let temp_data = {};
	let page = reg[2] == '??????' ? 1 : 0;
	let page_size = reg[2] == '??????' ? _page_size : 10;

	if (reg[4] == '????????????' || ((reg[4] == '??????' || reg[4] == '??????') && search == '???')) {
		if (reg[4] == '????????????' && search != '') return true;
		search = e.user_id;
		source = ['qq_radio', '????????????'];
		page = 0;
		page_size = 5;
		if (reg[4].includes('???')) {
			page_size = 1;
		} else {
			e.reply('??????????????????', true);
		}
	}

	if (reg[4] == '????????????' || reg[4] == '??????30???' || reg[4] == '??????') {
		if (search != '') return true;
		search = e.user_id;
		source = ['qq_recommend', '????????????'];
		page = 0;
		page_size = 30;
		e.reply('??????????????????', true);
	}

	if (reg[4] == '????????????' || reg[4] == '???????????????') {
		let page_reg = /^\d+$/.exec(search);
		if (search != '' && !page_reg) return true;
		search = e.user_id;
		source = ['qq_like', '??????'];
		page = (!page_reg ? 1 : parseInt(page_reg[0]));
		page_size = page == 0 ? 50 : _page_size;
		e.reply('??????????????????', true);
	}

	if (reg[4] == '?????????') {
		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data[key];
		if (!data || (new Date().getTime() - data.time) > (1000 * 60) || data.page < 1) {
			return false;
		}
		data.time = new Date().getTime();//??????????????????????????????
		page_size = _page_size;
		page = data.page + 1;
		search = data.search;
		source = data.source;
		temp_data = data;//????????????????????????
	}

	return music_handle(e, search, source, page, page_size, temp_data);
}

async function music_handle(e, search, source, page = 0, page_size = 10, temp_data = {}) {
	let result = await music_search(search, source[0], page == 0 ? 1 : page, page_size);
	if (result && result.data && result.data.length > 0) {
		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data;
		let temp = data[key];
		if (temp?.msg_results && (temp?.search != search || temp?.source[0] != source[0] || page < 2 || !temp_data?.data)) {
			delete data[key];
			recallMusicMsg(key, temp.msg_results);//?????????????????????????????????
		}
		data = {};

		if (page > 0 && result.data.length > 1) {
			page = result.page;
			let title = source[1] + '????????????';
			if (result.title) title = result.title;
			if (result.data.length >= page_size || page > 1) title += `[???${page}???]`;
			let msg_result = [];

			let setting = Config.getdefSet('setting', 'system') || {};
			if (setting['is_cardlist'] == true) {
				let json_result = ShareMusic_JSONList(e, result.data, page, page_size, title);
				msg_result.push(ArkMsg.Share(JSON.stringify(json_result.data), e, null, null, true));
			}

			if (e.guild_id) {//????????????????????????????????????????????????
				msg_result.push(e.reply(ShareMusic_TextList(e, result.data, page, page_size, title)));
			} else {
				msg_result.push(new Promise(async (resolve, reject) => {
					resolve(await e.reply(await ShareMusic_HtmlList(e, result.data, page, page_size, title)));//??????????????????
				}));
			}

			if (page > 1) {
				let list_data = temp_data.data; list_data = list_data ? list_data : [];
				list_data = list_data.concat(result.data);
				let msg_results = temp_data.msg_results; msg_results = msg_results ? msg_results : [];
				msg_results.push(msg_result);
				data = {
					time: new Date().getTime(),
					data: list_data,
					page: result.page,
					msg_results: msg_results,
					search: search,
					source: source,
					index: -1,
					start_index: !temp_data.data ? (page * page_size) - page_size : temp_data.start_index
				};
			} else {
				data = {
					time: new Date().getTime(),
					data: result.data,
					page: result.page,
					msg_results: [msg_result],
					search: search,
					source: source,
					index: -1,
					start_index: 0
				};
			}
		} else {
			if (source[0] == 'qq_radio' || source[0] == 'qq_recommend' || source[0] == 'qq_like') {
				let title;
				let nickname = e.sender.nickname || e.user_id;
				if (e.isGroup) {
					try {
						let info = await Bot.getGroupMemberInfo(e.group_id, e.user_id)
						nickname = info.card || info.nickname;
					} catch (err) { }
				}

				let user_info = {
					nickname: nickname,
					user_id: e.user_id
				};

				switch (source[0]) {
					case 'qq_radio':
						title = `??????${nickname}?????????????????????`;
						break;
					case 'qq_like':
						title = `${nickname}?????????`;
						break;
					case 'qq_recommend':
					default:
						title = result.title;
						break;
				}

				let MsgList = [];
				let index = 1;
				let tag = 'QQ??????' + source[1];
				if (result.data.length > 1) {

					if (result.desc) {
						MsgList.push({
							...user_info,
							message: result.desc
						});
					}

					for (let music of result.data) {
						let music_json = await CreateMusicShareJSON({
							...music,
						});
						music_json.app = 'com.tencent.qzone.structmsg';
						music_json.config.autosize = true;
						music = music_json.meta.music;
						music.tag = index + '.' + tag;
						music.preview = music.source_icon;
						MsgList.push({
							...user_info,
							message: segment.json(music_json)
						});
						index++;
					}

					let is_sign = true;
					let forwardMsg = await Bot.makeForwardMsg(MsgList);
					forwardMsg.data = forwardMsg.data
						.replace('<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.0" encoding="utf-8" ?>')
						.replace(/\n/g, '')
						.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
						.replace(/___+/, `<title color="#777777" size="26">${title}</title>`);
					if (!is_sign) {
						forwardMsg.data = forwardMsg.data
							.replace('?????????', '???????????????');
					}
					await e.reply(forwardMsg);
					data = {
						time: new Date().getTime() + (1000 * 60 * 29),
						data: result.data,
						page: 0,
						msg_results: [],
						search: search,
						source: source,
						index: -1,
						start_index: 0
					};
				} else {
					if (source[0] == 'qq_radio') {
						tag = nickname.length > 6 ? (nickname.substring(0, 6) + '...') : nickname;
						tag = `${tag}???????????????`;
					}
					let music = result.data[0];
					let music_json = await CreateMusicShareJSON({
						...music,
						app_name: tag
					});
					let ArkSend = await ArkMsg.Share(JSON.stringify(music_json), e);
					if (ArkSend.code != 1) {
						let body = await CreateMusicShare(e, music);
						await SendMusicShare(body);
					}
					data = {
						time: new Date().getTime(),
						data: [music],
						page: 0,
						msg_results: [],
						search: search,
						source: source,
						index: 0,
						start_index: 0
					};
				}
			} else {
				let music = result.data[0];
				data = {
					time: new Date().getTime(),
					data: [music],
					page: 0,
					msg_results: [],
					search: search,
					source: source,
					index: 0,
					start_index: 0
				};

				let music_json = await CreateMusicShareJSON(music);
				let ArkSend = await ArkMsg.Share(JSON.stringify(music_json), e);
				if (ArkSend.code != 1) {
					let body = await CreateMusicShare(e, music);
					await SendMusicShare(body);
				}
			}
		}
		xiaofei_plugin.music_temp_data[get_MusicListId(e)] = data;
	} else {
		if (page > 1) {
			await e.reply('???????????????????????????', true);
		} else {
			await e.reply(((source[0].includes('radio') || source[0].includes('recommend')) ? '???????????????????????????????????????' : '?????????????????????'), true);
		}
	}
	return true;

}

function ShareMusic_TextList(e, list, page, page_size, title = '') {
	let next_page = (page > 0 && list.length >= page_size) ? true : false;
	let message = [`---${title}---`];
	for (let i in list) {
		let music = list[i];
		let index = Number(i) + 1;
		if (page > 1) {
			index = ((page - 1) * page_size) + index;
		}
		message.push(index + '.' + music.name + '-' + music.artist);
	}
	message.push('----------------');
	message.push('???????????????????????????????????????????????????' + (next_page ? '????????????#????????????????????????' : '') + '???');
	return message.join('\n');
}

function ShareMusic_JSONList(e, list, page, page_size, title = '') {
	let next_page = (page > 0 && list.length >= page_size) ? true : false;
	let json = {
		"app": "com.tencent.bot.task.deblock",
		"config": {
			"autosize": 1,
			"type": "normal",
			"showSender": 0
		},
		"meta": {
			"detail": {
				"appID": "",
				"battleDesc": "",
				"botName": "Yunzai-Bot",
				"cmdList": [],
				"cmdTitle": "????????????????????????????????????:",
				"content": "",
				"guildID": "",
				"iconLeft": [],
				"iconRight": [],
				"receiverName": "@??????",
				"subGuildID": "SUBGUILDID#",
				"title": "",
				"titleColor": ""
			}
		},
		"prompt": "",
		"ver": "2.0.4.0",
		"view": "index"
	};
	json.prompt = `${title}`;
	json.meta.detail.receiverName = `@${e.nickname}`;
	json.meta.detail.title = `---${title}---`;
	let music_list = [];

	for (let i in list) {
		let music = list[i];
		let index = Number(i) + 1;
		if (page > 1) {
			index = ((page - 1) * page_size) + index;
		}
		music_list.push(`${index}.${music.name}-${music.artist}`);
	}

	json.meta.detail.content = music_list.join("\n");

	let cmdList = json.meta.detail.cmdList;
	cmdList.push({
		"cmdDesc": "????????????",
		"cmd": " ????????????",
		"cmdTitle": "??????"
	});

	if (next_page) {
		cmdList.push({
			"cmdDesc": "????????????",
			"cmd": " #?????????",
			"cmdTitle": "??????"
		});
	}

	cmdList.push({
		"cmdDesc": "????????????",
		"cmd": " #??????+??????",
		"cmdTitle": "??????"
	});

	cmdList.push({
		"cmdDesc": "????????????",
		"cmd": " #(??????)??????+??????",
		"cmdTitle": "??????"
	});
	return { data: json };
}

async function ShareMusic_HtmlList(e, list, page, page_size, title = '') {//?????????????????????earth-k-plugin?????????????????????????????????
	let next_page = (page > 0 && list.length >= page_size) ? true : false;
	let start = Date.now()
	let new_list = [];
	for (let i in list) {
		let music = list[i];
		let index = Number(i) + 1;
		if (page > 1) {
			index = ((page - 1) * page_size) + index;
		}
		new_list.push({
			index: index,
			name: music.name,
			artist: music.artist,
		});
	}
	let saveId = String(new Date().getTime());
	let dir = `data/html/xiaofei-plugin/music_list`;
	Data.createDir(dir, 'root');


	let _background_path = `${Plugin_Path}/resources/html/music_list/bg/default.jpg`;
	let background_path = '';
	let background_url = await get_background();

	if (background_url) {
		try {
			let response = await fetch(background_url);
			let buffer = Buffer.from(await response.arrayBuffer());
			if (buffer) {
				let file = `${process.cwd()}/${dir}/${saveId}.jpg`;
				fs.writeFileSync(file, buffer);
				background_path = file;
			}
		} catch (err) { }
	}

	let data = {
		plugin_path: Plugin_Path,
		background_path: background_path || _background_path,
		title: `${title.split('').join(' ')}`,
		tips: '??????????????????????????????????????????' + (next_page ? '????????????#????????????????????????' : '') + '???',
		sub_title: `Created By Yunzai-Bot ${Version.yunzai} & xiaofei-Plugin ${Version.ver}`,
		list: new_list,
	};


	let img = await puppeteer.screenshot("xiaofei-plugin/music_list", {
		saveId: saveId,
		tplFile: `${Plugin_Path}/resources/html/music_list/index.html`,
		data: data,
		imgType: 'jpeg',
		quality: 80
	});

	setTimeout(() => {
		fs.unlink(`${process.cwd()}/${dir}/${saveId}.html`, err => { });
		if (background_path) fs.unlink(background_path, err => { });
	}, 100);

	logger.mark(`[????????????_??????????????????????????????]${logger.green(`${Date.now() - start}ms`)}`);
	return img;
}

function get_MusicListId(e) {
	let id = '';
	if (e.guild_id) {
		id = `guild_${e.channel_id}_${e.guild_id}`;
	} else if (e.group) {
		id = `group_${e.group.gid}_${e.user_id}`;
	} else {
		id = `friend_${e.user_id}`;
	}
	return `${id}`;
}

async function get_background() {
	let background_url = '';
	let api = 'https://content-static.mihoyo.com/content/ysCn/getContentList?channelId=313&pageSize=1000&pageNum=1&isPreview=0';
	try {
		let response;
		let res;
		let background_temp = xiaofei_plugin.background_temp;
		if (background_temp && (new Date().getTime() - background_temp.time) < 1000 * 60 * 360) {
			res = background_temp.data;
		} else {
			response = await fetch(api); //????????????????????????
			res = await response.json(); //??????json??????????????????
		}

		if (res.retcode == 0 && res.data?.list) {
			if (response) {
				xiaofei_plugin.background_temp = {
					data: res,
					time: new Date().getTime()
				};
			}
			let list = res.data.list;
			let data = list[random(0, list.length - 1)].ext[0];
			if (data.value && data.value.length > 0) {
				background_url = data.value[random(0, data.value.length - 1)].url;
			}
		}
	} catch (err) {
	}
	return background_url;
}

async function music_search(search, source, page = 1, page_size = 10) {
	let list = [];
	let result = [];

	let value = {
		netease: {
			name: 'name', id: 'id',
			artist: (data) => {
				let ars = [];
				for (let index in data.ar) {
					ars.push(data.ar[index].name);
				}
				return ars.join('/');
			},
			pic: (data) => {
				let url = data.al ? data.al.picUrl + '?param=300x300' : no_pic;
				return url;
			},
			link: (data) => {
				let url = 'http://music.163.com/#/song?id=' + data.id;
				return url;
			},
			url: async (data) => {
				let url = 'http://music.163.com/song/media/outer/url?id=' + data.id;
				if (data.privilege && data.privilege.fee != 8) {
					try {
						let cookie = music_cookies.netease?.ck;
						cookie = cookie ? cookie : '';
						let options = {
							method: 'POST',//post?????? 
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI Build/SKQ1.211230.001)',
								'Cookie': 'versioncode=8008070; os=android; channel=xiaomi; ;appver=8.8.70; ' + cookie
							},
							body: `ids=${JSON.stringify([data.id])}&level=standard&encodeType=mp3`
						};
						let response = await fetch('https://interface3.music.163.com/api/song/enhance/player/url/v1', options); //????????????????????????
						let res = await response.json(); //??????json??????????????????
						if (res.code == 200) {
							url = res.data[0]?.url;
							url = url ? url : '';
						}
					} catch (err) { }
				}
				return url;
			},
			lrc: async (data) => {
				let url = `https://music.163.com/api/song/lyric?id=${data.id}&lv=-1&tv=-1`;
				try {
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'https://music.163.com/'
						}
					};
					let response = await fetch(url, options); //????????????????????????
					let res = await response.json();
					if (res.code == 200 && res.lrc?.lyric) {
						let lrc = res.lrc.lyric;
						if (res.tlyric.lyric) lrc = [lrc, res.tlyric.lyric];
						return lrc;
					}
				} catch (err) { }
				return '????????????????????????????????????';
			}
		},
		kuwo: {
			name: 'SONGNAME', id: 'MUSICRID', artist: 'ARTIST',
			pic1: async (data) => {
				let url = `http://artistpicserver.kuwo.cn/pic.web?type=rid_pic&pictype=url&content=list&size=320&rid=${data.MUSICRID.substring(6)}`;
				let response = await fetch(url); //????????????????????????
				let res = await response.text();
				url = '';
				if (res && res.indexOf('http') != -1) {
					url = res;
				}
				return url;
			},
			pic: (data) => {
				let url = data.web_albumpic_short;
				url = url ? 'http://img2.kuwo.cn/star/albumcover/' + url : (data.web_artistpic_short ? 'http://img2.kuwo.cn/star/starheads/' + data.web_artistpic_short : no_pic);
				return url;
			},
			link: (data) => {
				let url = 'http://yinyue.kuwo.cn/play_detail/' + data.MUSICRID.substring(6);
				return url;
			},
			url: async (data) => {
				let url = `http://antiserver.kuwo.cn/anti.s?useless=/resource/&format=mp3&rid=${data.MUSICRID}&response=res&type=convert_url&`;
				let response = await fetch(url.replace('convert_url', 'convert_url3')); //????????????????????????
				let res = await response.json(); //??????json??????????????????
				if (res && res.url) {
					url = res.url;
				}
				return url;
			},
			lrc: async (data) => {
				try {
					let url = `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${data.MUSICRID.substring(6)}`;
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'http://www.kuwo.cn/'
						}
					};
					let response = await fetch(url, options); //????????????????????????
					let res = await response.json();
					if (res.data?.lrclist) {
						let lrc = [];
						for (let val of res.data.lrclist) {
							let i = parseInt((Number(val.time) / 60) % 60); if (String(i).length < 2) i = `0${i}`;
							let s = parseInt(Number(val.time) % 60); if (String(s).length < 2) s = `0${s}`;
							let ms = val.time.split('.')[1] || '00'; if (ms.length > 3) ms = ms.substring(0, 3);
							lrc.push(`[${i}:${s}.${ms}]${val.lineLyric}`);
						}
						return lrc.join('\n');
					}
				} catch (err) { }
				return '????????????????????????????????????';
			}
		},
		qq: {
			name: (data) => {
				let name = data.title;
				return name.replace(/\<(\/)?em\>/g, '');
			},
			id: 'mid',
			artist: (data) => {
				let ars = [];
				for (let index in data.singer) {
					ars.push(data.singer[index].name);
				}
				return ars.join('/');
			},
			pic: (data) => {
				let album_mid = data.album ? data.album.mid : '';
				let singer_mid = data.singer ? data.singer[0].mid : '';
				let pic = (data.vs[1] && data.vs[1] != '') ? `T062R150x150M000${data.vs[1]}` : (album_mid != '' ? `T002R150x150M000${album_mid}` : (singer_mid != '' ? `T001R150x150M000${singer_mid}` : ''));
				let url = pic == '' ? no_pic : `http://y.gtimg.cn/music/photo_new/${pic}.jpg`;
				return url;
			},
			link: (data) => {
				let url = 'https://y.qq.com/n/yqq/song/' + data.mid + '.html';
				return url;
			},
			url: async (data) => {
				let code = md5(`${data.mid}q;z(&l~sdf2!nK`).substring(0, 5).toLocaleUpperCase();
				let play_url = `http://c6.y.qq.com/rsc/fcgi-bin/fcg_pyq_play.fcg?songid=&songmid=${data.mid}&songtype=1&fromtag=50&uin=${Bot.uin}&code=${code}`;
				if ((data.sa == 0 && data.pay?.price_track == 0) || data.pay?.pay_play == 1) {//????????????
					let json_body = {
						...music_cookies.qqmusic.body,
						"req_0": { "module": "vkey.GetVkeyServer", "method": "CgiGetVkey", "param": { "guid": md5(String(new Date().getTime())), "songmid": [], "songtype": [0], "uin": "0", "ctx": 1 } }
					};
					json_body.req_0.param.songmid = [data.mid];
					let options = {
						method: 'POST',//post?????? 
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'Cookie': ''
						},
						body: JSON.stringify(json_body)
					};

					let url = `https://u6.y.qq.com/cgi-bin/musicu.fcg`;
					try {
						let response = await fetch(url, options); //????????????????????????
						let res = await response.json();
						if (res.req_0 && res.req_0?.code == '0') {
							let midurlinfo = res.req_0.data.midurlinfo;
							let purl = '';
							if (midurlinfo && midurlinfo.length > 0) {
								purl = midurlinfo[0].purl;
								if (purl) play_url = 'http://ws.stream.qqmusic.qq.com/' + purl;
							}
						}
					} catch (err) { }
				}
				return play_url;
			},
			lrc: async (data) => {
				let url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?_=${new Date().getTime()}&cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=0&g_tk_new_20200303=5381&g_tk=5381&loginUin=0&songmid=${data.mid}`;
				try {
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'https://y.qq.com/'
						}
					};
					let response = await fetch(url, options); //????????????????????????
					let res = await response.json();
					if (res.lyric) {
						let lrc = Buffer.from(res.lyric, 'base64').toString();
						if (res.trans) lrc = [lrc, Buffer.from(res.trans, 'base64').toString()];
						return lrc;
					}
				} catch (err) { }
				return '????????????????????????????????????';
			}
		},
		kugou: {
			name: 'songname', id: 'hash', artist: 'singername',
			pic: null,
			link: (data) => {
				let url = `http://www.kugou.com/song/#hash=${data.hash}&album_id=${data.album_id}`;
				return url;
			},
			url: null,
			lrc: null,
			api: async (data, types, music_data = {}) => {
				let hash = data.hash;
				let album_id = data.album_id;
				let url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&dfid=&appid=1014&mid=1234567890&platid=4&album_id=${album_id}&_=${new Date().getTime()}`;
				let response = await fetch(url); //????????????????????????
				let res = await response.json(); //??????json??????????????????

				if (res.status != 1) {
					return music_data;
				}
				data = res.data;

				if (types.indexOf('pic') > -1) {
					music_data.pic = data.img ? data.img : no_pic;
				}
				if (types.indexOf('url') > -1) {
					let key = md5(`${hash}mobileservice`);
					music_data.url = `https://m.kugou.com/api/v1/wechat/index?cmd=101&hash=${hash}&key=${key}`;//????????????
					//??????????????????????????????????????????
					//music_data.url = data.play_url ? data.play_url : result.url;
				}
				if (types.indexOf('lrc') > -1) {
					music_data.lrc = data.lyrics || '????????????????????????????????????';
				}
				return music_data;
			}
		}
	};

	switch (source) {
		case 'netease':
			result = await netease_search(search, page, page_size);
			break;
		case 'kuwo':
			result = await kuwo_search(search, page, page_size);
			break;
		case 'kugou':
			result = await kugou_search(search, page, page_size);
			break;
		case 'qq_radio':
			source = 'qq';
			result = await qqmusic_radio(search, page_size);
			break;
		case 'qq_recommend':
			source = 'qq';
			result = await qqmusic_getdiss(search, 0, 202, page, page_size);
			break;
		case 'qq_like':
			source = 'qq';
			result = await qqmusic_getdiss(search, 0, 201, page, page_size);
			break;
		case 'qq':
		default:
			source = 'qq';
			result = await qqmusic_search(search, page, page_size);
			break;
	}
	if (result && result.data && result.data.length > 0) {
		page = result.page;
		let result_data = result.data;
		for (let i in result_data) {
			let data = result_data[i];
			let name = value[source].name; name = typeof (name) == 'function' ? await name(data) : data[name];
			let id = data[value[source].id]; if (source == 'kuwo') { id = id.substring(6); }
			let artist = value[source].artist; artist = typeof (artist) == 'function' ? await artist(data) : data[artist];
			let pic = value[source].pic; pic = typeof (pic) == 'function' ? pic/*await pic(data)*/ : data[pic];
			let link = value[source].link; link = typeof (link) == 'function' ? link(data) : data[link];
			let url = value[source].url; url = typeof (url) == 'function' ? url/*await url(data)*/ : data[url];
			let lrc = value[source].lrc; lrc = typeof (lrc) == 'function' ? lrc/*await lrc(data)*/ : data[lrc];
			list.push({
				id: id,
				name: name,
				artist: artist,
				pic: pic,
				link: link,
				url: url,
				lrc: lrc,
				source: source,
				data: data,
				api: value[source].api
			});
		}
	}
	return { title: result?.title, desc: result?.desc, page: page, data: list };
}

async function CreateMusicShareJSON(data) {
	let music_json = { "app": "com.tencent.structmsg", "desc": "??????", "view": "music", "ver": "0.0.0.1", "prompt": "", "meta": { "music": { "app_type": 1, "appid": 0, "desc": "", "jumpUrl": "", "musicUrl": "", "preview": "", "sourceMsgId": "0", "source_icon": "", "source_url": "", "tag": "", "title": "" } }, "config": { "type": "normal", "forward": true } };
	let music = music_json.meta.music;

	let appid, app_name, app_icon;
	switch (data.source) {
		case 'netease':
			appid = 100495085;
			app_name = '???????????????';
			app_icon = 'https://i.gtimg.cn/open/app_icon/00/49/50/85/100495085_100_m.png';

			break;
		case 'kuwo':
			appid = 100243533
			app_name = '????????????';
			app_icon = 'https://p.qpic.cn/qqconnect/0/app_100243533_1636374695/100?max-age=2592000&t=0';
			break;
		case 'kugou':
			appid = 205141;
			app_name = '????????????';
			app_icon = 'https://open.gtimg.cn/open/app_icon/00/20/51/41/205141_100_m.png?t=0';
			break;
		case 'qq':
		default:
			appid = 100497308;
			app_name = 'QQ??????';
			app_icon = 'https://p.qpic.cn/qqconnect/0/app_100497308_1626060999/100?max-age=2592000&t=0';
			break;
	}

	var title = data.name, singer = data.artist, prompt = '[??????]', jumpUrl, preview, musicUrl;

	let types = [];
	if (data.url == null) { types.push('url') };
	if (data.pic == null) { types.push('pic') };
	if (data.link == null) { types.push('link') };
	if (types.length > 0 && typeof (data.api) == 'function') {
		let { url, pic, link } = await data.api(data.data, types);
		if (url) { data.url = url; }
		if (pic) { data.pic = pic; }
		if (link) { data.link = link; }
	}

	typeof (data.url) == 'function' ? musicUrl = await data.url(data.data) : musicUrl = data.url;
	typeof (data.pic) == 'function' ? preview = await data.pic(data.data) : preview = data.pic;
	typeof (data.link) == 'function' ? jumpUrl = await data.link(data.data) : jumpUrl = data.link;

	data.url = musicUrl;

	if (typeof (musicUrl) != 'string' || musicUrl == '') {
		musicUrl = '';
	}

	if (data.prompt) {
		prompt = '[??????]' + data.prompt;
	} else {
		prompt = '[??????]' + title + '-' + singer;
	}

	app_name = data.app_name || app_name;
	if (typeof (data.config) == 'object') music_json.config = data.config;

	music.appid = appid;
	music.desc = singer;
	music.jumpUrl = jumpUrl;
	music.musicUrl = musicUrl;
	music.preview = preview;
	music.title = title;
	music.appid = appid;
	music.tag = `????????????[${app_name}]`;
	music.source_icon = app_icon;
	music_json.prompt = prompt;
	if (!musicUrl) {
		music_json.view = 'news';
		music_json.meta.news = music_json.meta.music;
		delete music_json.meta.music;
	}
	return music_json;
}

async function CreateMusicShare(e, data, to_uin = null) {
	let appid, appname, appsign, style = 4;
	switch (data.source) {
		case 'netease':
			appid = 100495085, appname = "com.netease.cloudmusic", appsign = "da6b069da1e2982db3e386233f68d76d";
			break;
		case 'kuwo':
			appid = 100243533, appname = "cn.kuwo.player", appsign = "bf9ff4ffb4c558a34ee3fd52c223ebf5";
			break;
		case 'kugou':
			appid = 205141, appname = "com.kugou.android", appsign = "fe4a24d80fcf253a00676a808f62c2c6";
			break;
		case 'migu':
			appid = 1101053067, appname = "cmccwm.mobilemusic", appsign = "6cdc72a439cef99a3418d2a78aa28c73";
			break;
		case 'qq':
		default:
			appid = 100497308, appname = "com.tencent.qqmusic", appsign = "cbd27cd7c861227d013a25b2d10f0799";
			break;
	}

	var text = '', title = data.name, singer = data.artist, prompt = '[??????]', jumpUrl, preview, musicUrl;

	if (data.text) {
		text = data.text;
	}

	let types = [];
	if (data.url == null) { types.push('url') };
	if (data.pic == null) { types.push('pic') };
	if (data.link == null) { types.push('link') };
	if (types.length > 0 && typeof (data.api) == 'function') {
		let { url, pic, link } = await data.api(data.data, types);
		if (url) { data.url = url; }
		if (pic) { data.pic = pic; }
		if (link) { data.link = link; }
	}

	typeof (data.url) == 'function' ? musicUrl = await data.url(data.data) : musicUrl = data.url;
	typeof (data.pic) == 'function' ? preview = await data.pic(data.data) : preview = data.pic;
	typeof (data.link) == 'function' ? jumpUrl = await data.link(data.data) : jumpUrl = data.link;

	data.url = musicUrl;

	if (typeof (musicUrl) != 'string' || musicUrl == '') {
		style = 0;
		musicUrl = '';
	}

	if (data.prompt) {
		prompt = '[??????]' + data.prompt;
	} else {
		prompt = '[??????]' + title + '-' + singer;
	}

	let recv_uin = 0;
	let send_type = 0;
	let recv_guild_id = 0;

	if (e.isGroup && to_uin == null) {//??????
		recv_uin = e.group.gid;
		send_type = 1;
	} else if (e.guild_id) {//??????
		recv_uin = Number(e.channel_id);
		recv_guild_id = BigInt(e.guild_id);
		send_type = 3;
	} else if (to_uin == null) {//??????
		recv_uin = e.friend.uid;
		send_type = 0;
	} else {//??????????????????
		recv_uin = to_uin;
		send_type = 0;
	}

	let body = {
		1: appid,
		2: 1,
		3: style,
		5: {
			1: 1,
			2: "0.0.0",
			3: appname,
			4: appsign,
		},
		6: text,
		10: send_type,
		11: recv_uin,
		12: {
			10: title,
			11: singer,
			12: prompt,
			13: jumpUrl,
			14: preview,
			16: musicUrl,
		},
		19: recv_guild_id
	};
	return body;
}

async function SendMusicShare(body) {

	let payload = await Bot.sendOidb("OidbSvc.0xb77_9", core.pb.encode(body));

	let result = core.pb.decode(payload);

	if (result[3] != 0) {
		e.reply('?????????????????????' + result[3], true);
	}
}

async function get_netease_userinfo(ck = null) {
	try {
		let url = 'https://interface.music.163.com/api/nuser/account/get';
		let options = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': ck || music_cookies.netease.ck
			}
		};

		let response = await fetch(url, options); //????????????????????????
		let res = await response.json();
		if (res?.code == '200' && res.profile) {
			let profile = res.profile;
			let account = res.account;
			return {
				code: 1, data: {
					userid: profile.userId,
					nickname: profile.nickname,
					is_vip: account?.vipType != 0
				}
			};
		}
	} catch (err) { }
	return { code: -1 };
}


async function get_qqmusic_userinfo(ck = null) {
	try {
		let url = `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?_=${new Date().getTime()}&cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&uin=0&g_tk_new_20200303=5381&g_tk=5381&cid=205360838&userid=0&reqfrom=1&reqtype=0&hostUin=0&loginUin=0`;
		let cookies = [];
		ck = ck || music_cookies.qqmusic.ck;

		for (let key of ck.keys()) {
			let value = ck.get(key);
			if (value) {
				cookies.push(`${key}=${value}`);
			}
		}

		let options = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': cookies.join('; ')
			}
		};

		let response = await fetch(url, options); //????????????????????????
		let res = await response.json();
		if (res?.code == '0' && res.data?.creator) {
			let creator = res.data.creator;
			return {
				code: 1, data: {
					userid: ck.get('uin') || ck.get('wxuin'),
					nickname: creator.nick,
					is_vip: await is_qqmusic_vip(ck.get('uin') || ck.get('wxuin'))
				}
			};
		}
	} catch (err) { }
	return { code: -1 };
}

async function is_qqmusic_vip(uin, cookies = null) {
	let json = {
		"comm": { "cv": 4747474, "ct": 24, "format": "json", "inCharset": "utf-8", "outCharset": "utf-8", "notice": 0, "platform": "yqq.json", "needNewCode": 1, "uin": 0, "g_tk_new_20200303": 5381, "g_tk": 5381 },
		"req_0": {
			"module": "userInfo.VipQueryServer",
			"method": "SRFVipQuery_V2",
			"param": {
				"uin_list": [uin]
			}
		}
	};

	let options = {
		method: 'POST',//post?????? 
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookies || Bot.cookies['y.qq.com']
		},
		body: JSON.stringify(json)
	};

	let url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;
	try {
		let response = await fetch(url, options); //????????????????????????
		let res = await response.json();
		if (res.req_0 && res.req_0?.code == '0') {
			let data = res.req_0.data?.infoMap?.[uin];
			if (data.iVipFlag == 1 || data.iSuperVip == 1 || data.iNewVip == 1 || data.iNewSuperVip == 1) {
				return true;
			}
		}
	} catch (err) { }
	return false;
}

async function kugou_search(search, page = 1, page_size = 10) {
	try {
		let url = `http://msearchcdn.kugou.com/api/v3/search/song?page=${page}&pagesize=${page_size}&keyword=${encodeURI(search)}`;
		let response = await fetch(url, { method: "get" }); //????????????????????????
		let res = await response.json(); //??????json??????????????????
		if (!res.data || res.data.info < 1) {
			return [];
		}
		return { page: page, data: res.data.info };
	} catch (err) { }

	return null;
}


async function qqmusic_refresh_token(cookies, type) {
	let result = { code: -1 };
	let json_body = {
		...music_cookies.qqmusic.body,
		req_0: {
			"method": "Login",
			"module": "music.login.LoginServer",
			"param": {
				"access_token": "",
				"expired_in": 0,
				"forceRefreshToken": 0,
				"musicid": 0,
				"musickey": "",
				"onlyNeedAccessToken": 0,
				"openid": "",
				"refresh_token": "",
				"unionid": ""
			}
		}
	};
	let req_0 = json_body.req_0;
	if (type == 0) {
		req_0.param.appid = 100497308;
		req_0.param.access_token = cookies.get("psrf_qqaccess_token") || '';
		req_0.param.musicid = Number(cookies.get("uin") || '0');
		req_0.param.openid = cookies.get("psrf_qqopenid") || '';
		req_0.param.refresh_token = cookies.get("psrf_qqrefresh_token") || '';
		req_0.param.unionid = cookies.get("psrf_qqunionid") || '';
	} else if (type == 1) {
		req_0.param.strAppid = "wx48db31d50e334801";
		req_0.param.access_token = cookies.get("wxaccess_token") || '';
		req_0.param.str_musicid = cookies.get("wxuin") || '0';
		req_0.param.openid = cookies.get("wxopenid") || '';
		req_0.param.refresh_token = cookies.get("wxrefresh_token") || '';
		req_0.param.unionid = cookies.get("wxunionid") || '';
	} else {
		return result;
	}
	req_0.param.musickey = (cookies.get("qqmusic_key") || cookies.get("qm_keyst")) || '';

	let options = {
		method: 'POST',//post?????? 
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: JSON.stringify(json_body)
	};

	let url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;
	try {
		let response = await fetch(url, options); //????????????????????????
		let res = await response.json(); //??????json??????????????????
		if (res.req_0?.code == '0') {
			let map = new Map();
			let data = res.req_0?.data;
			if (type == 0) {
				map.set("psrf_qqopenid", data.openid);
				map.set("psrf_qqrefresh_token", data.refresh_token);
				map.set("psrf_qqaccess_token", data.access_token);
				map.set("psrf_access_token_expiresAt", data.expired_at);
				map.set("uin", String(data.str_musicid || data.musicid) || '0');
				map.set("qqmusic_key", data.musickey);
				map.set("qm_keyst", data.musickey);
				map.set("psrf_musickey_createtime", data.musickeyCreateTime);
				map.set("psrf_qqunionid", data.unionid);
				map.set("euin", data.encryptUin);
				map.set("login_type", 1);
				map.set("tmeLoginType", 2);
				result.code = 1;
				result.data = map;
			} else if (type == 1) {
				map.set("wxopenid", data.openid);
				map.set("wxrefresh_token", data.refresh_token);
				map.set("wxaccess_token", data.access_token);
				map.set("wxuin", String(data.str_musicid || data.musicid) || '0');
				map.set("qqmusic_key", data.musickey);
				map.set("qm_keyst", data.musickey);
				map.set("psrf_musickey_createtime", data.musickeyCreateTime);
				map.set("wxunionid", data.unionid);
				map.set("euin", data.encryptUin);
				map.set("login_type", 2);
				map.set("tmeLoginType", 1);
				result.code = 1;
				result.data = map;
			}
		}
	} catch (err) {
		logger.error(err);
	}
	return result;
}

async function qqmusic_radio(uin, page_size) {
	try {
		let json_body = {
			...JSON.parse(JSON.stringify(music_cookies.qqmusic.body)),
			"req_0": { "method": "get_radio_track", "module": "pc_track_radio_svr", "param": { "id": 99, "num": 1 } }
		};
		json_body.comm.guid = md5(String(new Date().getTime()));
		json_body.comm.uin = uin;
		json_body.comm.tmeLoginType = 2;
		json_body.comm.psrf_qqunionid = '';
		json_body.comm.authst = '';
		json_body.req_0.param.num = page_size;

		let options = {
			method: 'POST',//post?????? 
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: JSON.stringify(json_body)
		};

		let url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;
		let response = await fetch(url, options); //????????????????????????
		let res = await response.json(); //??????json??????????????????

		if (res.code != '0' && res.req_0.code != '0') {
			return null;
		}

		let data = res.req_0?.data?.tracks;
		data = data ? data : [];
		return { page: 0, data: data };
	} catch (err) { }

	return null;
}

async function qqmusic_getdiss(uin = 0, disstid = 0, dirid = 202, page = 1, page_size = 30) {
	try {
		let json_body = {
			...JSON.parse(JSON.stringify(music_cookies.qqmusic.body)),
			"req_0": { "module": "srf_diss_info.DissInfoServer", "method": "CgiGetDiss", "param": { "disstid": 0, "dirid": 202, "onlysonglist": 0, "song_begin": 0, "song_num": 500, "userinfo": 1, "pic_dpi": 800, "orderlist": 1 } }
		};
		json_body.comm.guid = md5(String(new Date().getTime()));
		json_body.comm.uin = uin;
		json_body.comm.tmeLoginType = 2;
		json_body.comm.psrf_qqunionid = '';
		json_body.comm.authst = '';
		json_body.req_0.param.song_num = page_size;
		json_body.req_0.param.song_begin = ((page < 1 ? 1 : page) * page_size) - page_size;
		json_body.req_0.param.disstid = disstid;
		json_body.req_0.param.dirid = dirid;

		let options = {
			method: 'POST',//post?????? 
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: JSON.stringify(json_body)
		};

		let url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;
		let response = await fetch(url, options); //????????????????????????
		let res = await response.json(); //??????json??????????????????

		if (res.code != '0' && res.req_0.code != '0') {
			return null;
		}

		let dirinfo = res.req_0?.data?.dirinfo || {};
		let data = res.req_0?.data?.songlist;
		data = data ? data : [];
		return { title: dirinfo.title, desc: dirinfo.desc, page: page, data: data };
	} catch (err) { }

	return null;
}



async function qqmusic_search(search, page = 1, page_size = 10) {
	try {
		let qq_search_json = {
			"comm": {
				"_channelid": "19",
				"_os_version": "6.2.9200-2",
				"authst": "",
				"ct": "19",
				"cv": "1891",
				"guid": md5(String(new Date().getTime()) + random(100000, 999999)),
				"patch": "118",
				"psrf_access_token_expiresAt": 0,
				"psrf_qqaccess_token": "",
				"psrf_qqopenid": "",
				"psrf_qqunionid": "",
				"tmeAppID": "qqmusic",
				"tmeLoginType": 2,
				"uin": "0",
				"wid": "0"
			},
			"search": {
				"method": "DoSearchForQQMusicDesktop",
				"module": "music.search.SearchCgiService",
				"param": {
					"grp": 1,
					"num_per_page": 40,
					"page_num": 1,
					"query": "",
					"remoteplace": "sizer.newclient.song",
					"search_type": 0,
					"searchid": ""
				}
			}
		};

		qq_search_json['search']['param']['searchid'] = md5(String(new Date().getTime()) + random(100000, 999999));
		qq_search_json['search']['param']['query'] = search;
		qq_search_json['search']['param']['page_num'] = page;
		qq_search_json['search']['param']['num_per_page'] = page_size;

		let options = {
			method: 'POST',//post?????? 
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': Bot.cookies['y.qq.com']
			},
			body: JSON.stringify(qq_search_json)
		};

		let url = `https://u.y.qq.com/cgi-bin/musicu.fcg`;

		let response = await fetch(url, options); //????????????????????????

		let res = await response.json(); //??????json??????????????????

		if (res.code != '0') {
			return null;
		}
		return { page: page, data: res.search.data.body.song.list };
	} catch (err) { }

	return null;
}

async function netease_search(search, page = 1, page_size = 10) {
	try {
		let offset = page < 1 ? 0 : page;
		offset = (page_size * page) - page_size;
		let url = 'http://music.163.com/api/cloudsearch/pc';
		let options = {
			method: 'POST',//post?????? 
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': music_cookies.netease.ck
			},
			body: `offset=${offset}&limit=${page_size}&type=1&s=${encodeURI(search)}`
		};

		let response = await fetch(url, options); //????????????????????????
		let res = await response.json(); //??????json??????????????????

		if (res.result.songs < 1) {
			return null;
		}
		return { page: page, data: res.result.songs };
	} catch (err) { }

	return null;
}

async function kuwo_search(search, page = 1, page_size = 10) {
	try {
		let url = `http://search.kuwo.cn/r.s?user=&android_id=&prod=kwplayer_ar_10.1.2.1&corp=kuwo&newver=3&vipver=10.1.2.1&source=kwplayer_ar_10.1.2.1_40.apk&p2p=1&q36=&loginUid=&loginSid=&notrace=0&client=kt&all=${search}&pn=${page - 1}&rn=${page_size}&uid=&ver=kwplayer_ar_10.1.2.1&vipver=1&show_copyright_off=1&newver=3&correct=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&searchapi=5&issubtitle=1&province=&city=&latitude=&longtitude=&userIP=&searchNo=&spPrivilege=0`;
		let response = await fetch(url, { method: "get" }); //????????????????????????
		let res = await response.json(); //??????json??????????????????
		if (res.abslist.length < 1) {
			return null;
		}
		return { page: page, data: res.abslist };
	} catch (err) { }

	return null;
}

function getCookieMap(cookie) {
	let cookiePattern = /^(\S+)=(\S+)$/;
	let cookieArray = cookie.replace(/\s*/g, "").split(";");
	let cookieMap = new Map();
	for (let item of cookieArray) {
		let entry = item.split("=");
		if (!entry[0]) continue;
		cookieMap.set(entry[0], entry[1]);
	}
	return cookieMap || {};
}

function random(min, max) {
	//?????????3????????????????????????100-999???
	//const max = 100;
	//const min = 999;
	//??????6????????????????????????100000-999999??????
	//const min    = 100000;                            //?????????
	//const max    = 999999;                            //?????????
	const range = max - min;                         //???????????????
	const random = Math.random();                     //??????1????????????
	const result = min + Math.round(random * range);  //?????????????????????*????????? 
	//????????????????????????????????????????????????
	//????????????????????????CSDN??????????????????????????????????????????????????????CC 4.0 BY-SA???????????????????????????????????????????????????????????????
	//???????????????https://blog.csdn.net/m0_51317381/article/details/124499851
	return result;
}

/*
????????????sleep
?????? await sleep(1500)
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}