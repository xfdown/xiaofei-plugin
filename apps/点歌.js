import plugin from '../../../lib/plugins/plugin.js'
import fetch from "node-fetch";
import { core } from "oicq";
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import {Config, Version, Plugin_Path} from '../components/index.js'
import uploadRecord from '../model/uploadRecord.js'
import { segment } from "oicq";
import ArkMsg from '../model/ArkMsg.js'
import fs from 'fs'
const no_pic = '';
var _page_size = 20;

var music_cookies = {
	qqmusic: {
		get ck(){
			try{
				let data = Config.getConfig('music','cookies');
				if(data?.qqmusic){
					return getCookieMap(data?.qqmusic);
				}
			}catch(err){}
			return null;
		},
		set ck(cookies){
			try{
				if(typeof(cookies) == 'object'){
					try{
						let cks = [];
						for(let key of cookies.keys()){
							let value = cookies.get(key);
							if(value){
								cks.push(`${key}=${value}`);
							}
						}
						cookies = cks.join('; ');
					}catch(err){}
				}
				let data = Config.getConfig('music','cookies');
				data = data ? data : {};
				data.qqmusic = cookies;
				Config.saveConfig('music','cookies',data);
				return;
			}catch(err){
				logger.error(err);
			}
			return;
		},
		body: {
			comm: {
				"_channelid" : "19",
				"_os_version" : "6.2.9200-2",
				"authst" : "",
				"ct" : "19",
				"cv" : "1891",
				"guid" : md5(String(new Date().getTime()),32),
				"patch" : "118",
				"psrf_access_token_expiresAt" : 0,
				"psrf_qqaccess_token" : "",
				"psrf_qqopenid" : "",
				"psrf_qqunionid" : "",
				"tmeAppID" : "qqmusic",
				"tmeLoginType" : 2,
				"uin" : "0",
				"wid" : "0"
			}
		},
		init: false,
		update_time: 0
	},
	netease: {
		get ck(){
			try{
				let data = Config.getConfig('music','cookies');
				if(data?.netease){
					return data?.netease;
				}
			}catch(err){}
			return '';
		},
		set ck(cookies){
			try{
				let data = Config.getConfig('music','cookies');
				data = data ? data : {};
				data.netease = cookies;
				Config.saveConfig('music','cookies',data);
				return;
			}catch(err){
				logger.error(err);
			}
			return;
		}
	}
};

const music_reg = '^#?(小飞)?(多选)?(qq|QQ|腾讯|网易云?|酷我|酷狗)?(点播音乐|点播|点歌|播放|来一?首|下一页|个性电台)(.*)$';

export class xiaofei_music extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_点歌',
			/** 功能描述 */
			dsc: '使用互联分享接口发送音乐，目前支持以下命令：【#点歌 #多选点歌 #QQ点歌 #网易点歌 #酷我点歌 #酷狗点歌】',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: music_reg,
					/** 执行方法 */
					fnc: 'music'
				},
				{
					/** 命令正则匹配 */
					reg: '^#?(点歌|音乐)(ck|cookie)(检查|状态)$',
					/** 执行方法 */
					fnc: 'music_ck_check',
					permission: 'master'
				},
				{
					/** 命令正则匹配 */
					reg: '^#?提交(音乐|点歌)ck.*$',
					/** 执行方法 */
					fnc: 'submit_music_ck',
					permission: 'master'
				}
			]
		});
		
		try{
			let setting = Config.getdefSet('setting','system') || {};
			this.priority = setting['music'] == true ? 10 : 2000;
		}catch(err){}
		
		this.task = [
			{
				cron: '*/10 * * * * ?',
				name: '[小飞插件_点歌]默认任务',
				fnc: this.music_task,
				log: false
			}
		];
	}
	
	async init(){
		try{
			for(let key in music_cookies){
				let ck = music_cookies[key].ck;
				if(key == 'netease' && (!ck || ck?.includes('MUSIC_U=;'))){
					logger.info(`【小飞插件_网易云音乐ck】未设置网易云音乐ck！`);
				}
			}
			await update_qqmusic_ck();
		}catch(err){}

		try{
			let path = `${process.cwd()}/data/html/xiaofei-plugin/music_list`;
			let files = fs.readdirSync(path);
			files.forEach(file => {
				fs.unlink(`${path}/${file}`,err => {});
			});
		}catch(err){}
	}
	
	async music_task(){
		let data = xiaofei_plugin.music_temp_data;
		for(let key in data){
			if((new Date().getTime() - data[key].time) > (1000 * 60)){
				await recallMusicMsg(key,data[key].msg_results);
				delete data[key];
			}
		}
		try{
			await update_qqmusic_ck();
		}catch(err){
			logger.error(err);
		}
	}

	async music(){
		return music_message(this.e);
	}
	
	/** 接受到消息都会先执行一次 */
	accept () {
		if(/^#?(小飞语音|小飞高清语音|小飞歌词|语音|高清语音|歌词)?(\d+)?$/.test(this.e.msg)){
			music_message(this.e);
		}
		return;
	}

	async music_ck_check(e){
		let msgs = [];
		let list = [
			{
				name: 'QQ音乐',
				ck: music_cookies.qqmusic.ck,
				user_info: get_qqmusic_userinfo
			},{
				name: '网易云音乐',
				ck: !music_cookies.netease.ck?.includes('MUSIC_U=;'),
				user_info: get_netease_userinfo
			}
		];
		for(let val of list){
			msgs.push(`---${val.name}---`);
			if(!val.ck){
				msgs.push(`状态：未设置ck`);
			}else{
				let result = await val.user_info();
				if(result.code == 1){
					let data = result.data;
					msgs.push(`用户：${data.nickname}[${data.userid}]`);
					msgs.push(`状态：ck状态正常`);
					msgs.push(`是否VIP：${data.is_vip ? '是' : '否'}`);
				}else{
					msgs.push(`状态：ck已失效`);
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
			message: `---音乐ck状态---\n${msgs.join('\n')}`
		});
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await e.reply(forwardMsg);
		return true;
	}
	async submit_music_ck(e){
		let reg = /^#?提交(音乐|点歌)ck(.*)$/.exec(e.msg);
		if(reg){
			let cookies;
			try{
				cookies = getCookieMap(reg[2]);
				if(cookies.get('MUSIC_U')){
					let netease_cookies = `MUSIC_U=${cookies.get('MUSIC_U')};`;
					let result = await get_netease_userinfo(netease_cookies);
					if(result.code != 1){
						await e.reply(`网易云音乐ck不正确或已失效，请重新获取！`);
						return true;
					}
					music_cookies.netease.ck = netease_cookies;
					let data = result.data;
					await e.reply(`网易云音乐ck提交成功！\n用户：${data.nickname}[${data.userid}]\n是否VIP：${data.is_vip ? '是' : '否'}`);
					return true;
				}else if(cookies.get('wxunionid') || cookies.get('psrf_qqunionid')){
					let result = await get_qqmusic_userinfo(cookies);
					if(result.code != 1){
						await e.reply(`QQ音乐ck不正确或已失效，请重新获取！`);
						return true;
					}
					cookies.set('psrf_musickey_createtime',0);
					music_cookies.qqmusic.ck = cookies;
					music_cookies.qqmusic.update_time = 0;
					try{
						update_qqmusic_ck();
					}catch(err){}
					let data = result.data;
					await e.reply(`QQ音乐ck提交成功！\n用户：${data.nickname}[${data.userid}]\n是否VIP：${data.is_vip ? '是' : '否'}`);
					return true;
				}
			}catch(err){
				await e.reply(`ck解析出错，请检查输入是否正确！`);
			}
		}

		let MsgList = [];
		let user_info = {
			nickname: Bot.nickname,
			user_id: Bot.uin
		};

		let msgs = [];
		msgs.push(`---QQ音乐ck说明---`);
		msgs.push(`请前往：http://y.qq.com/ 获取以下ck：`);
		msgs.push(`QQ登录必须参数：uin=; psrf_qqopenid=; psrf_qqunionid=; psrf_qqrefresh_token=;`);
		msgs.push(`微信登录必须参数：wxuin=; wxopenid=; wxunionid=; wxrefresh_token=;`);
		msgs.push(`---网易云音乐ck说明---`);
		msgs.push(`请前往：http://music.163.com/ 获取以下ck：`);
		msgs.push(`必须参数：MUSIC_U=;`);
		msgs.push(`因网易云音乐ck使用了HttpOnly，手机端需使用抓包工具获取，pc端请使用浏览器的开发人员工具获取。`);
		MsgList.push({
			...user_info,
			message: `---提交音乐ck---\n${msgs.join('\n')}`
		});
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await e.reply(forwardMsg);
		return true;
	}
}

if(!global.xiaofei_plugin){
	global.xiaofei_plugin = {
		music_temp_data: {}
	};
	//xiaofei_plugin.music_temp_data = {};
}

if(xiaofei_plugin.music_guild){
	Bot.off('guild.message',xiaofei_plugin.music_guild);
}

xiaofei_plugin.music_guild = async (e) => {//处理频道消息
	e.msg = e.raw_message;
	if(RegExp(music_reg).test(e.msg) || /^#?(小飞语音|小飞高清语音|小飞歌词|语音|高清语音|歌词)?(\d+)?$/.test(e.msg)){
		music_message(e);
	}
};
Bot.on('guild.message',xiaofei_plugin.music_guild);

async function update_qqmusic_ck(){
	try{
		let update_time = music_cookies.qqmusic.update_time;
		if((new Date().getTime() - update_time) < (1000 * 60 * 10)){
			return;
		}
		music_cookies.qqmusic.update_time = new Date().getTime();
		let type = -1;//QQ:0,微信:1
		let ck_map = music_cookies.qqmusic.ck || new Map();
		if(ck_map.get('wxunionid')){
			type = 1;
		}else if(ck_map.get('psrf_qqunionid')){
			type = 0;
		}else{
			if(!music_cookies.qqmusic.init){
				music_cookies.qqmusic.init = true;
				logger.info(`【小飞插件_QQ音乐ck】未设置QQ音乐ck！`);
			}
			return;
		}
		let authst = ck_map.get('music_key') || ck_map.get('qm_keyst');
		let psrf_musickey_createtime = Number(ck_map.get("psrf_musickey_createtime") || 0) * 1000;
		let refresh_num = Number(ck_map.get("refresh_num") || 0);
		if(((new Date().getTime() - psrf_musickey_createtime) > (1000 * 60 * 60 * 12) || !authst) && refresh_num < 3){
			let result = await qqmusic_refresh_token(ck_map,type);
			if(result.code == 1){
				ck_map = result.data;
				logger.info(`【小飞插件_QQ音乐ck】已刷新！`);
			}else{
				ck_map.set("refresh_num",refresh_num+1);
				music_cookies.qqmusic.init = false;
				logger.error(`【小飞插件_QQ音乐ck】刷新失败！`);
			}
			music_cookies.qqmusic.ck = ck_map;
			authst = ck_map.get('music_key') || ck_map.get('qm_keyst');
		}else if(refresh_num > 2){
			if(!music_cookies.qqmusic.init){
				music_cookies.qqmusic.init = true;
				logger.error(`【小飞插件_QQ音乐ck】ck已失效！`);
			}
		}
		let comm = music_cookies.qqmusic.body.comm;
		if(type == 0) comm.uin = ck_map.get('uin') || '',comm.psrf_qqunionid = ck_map.get('psrf_qqunionid') || '';
		if(type == 1) comm.wid = ck_map.get('wxuin') || '',comm.psrf_qqunionid = ck_map.get('wxunionid') || '';
		comm.tmeLoginType = Number(ck_map.get('tmeLoginType') || '2');
		comm.authst = authst || '';
		comm.guid = md5(String(comm.authst + comm.uin + comm.wid),32);
	}catch(err){
		logger.error(err);
	}
}

async function recallMusicMsg(key,msg_results){
	if(msg_results && msg_results.length > 0){
		for(let msg_result of msg_results){
			let arr = key.split('_');
			let type = arr[0];
			for(let val of msg_result){
				try{
					let message_id = (await val)?.message_id;
					switch(type){
						case 'group':
							await Bot.pickGroup(arr[1]).recallMsg(message_id);
							break;
						case 'friend':
							await Bot.pickFriend(arr[1]).recallMsg(message_id);
							break;
					}
				}catch(err){
					logger.error(err);
				}
			}
		}
	}
}

async function music_message(e){
	let reg = /^#?(小飞语音|小飞高清语音|小飞歌词|语音|高清语音|歌词)?(\d+)?$/.exec(e.msg);
	if(reg){

		if(e.source && reg[1]?.includes('语音')){
			let source;
			if (e.isGroup) {
				source = (await e.group.getChatHistory(e.source.seq, 1)).pop();
			} else {
				source = (await e.friend.getChatHistory(e.source.time, 1)).pop();
			}
			if(source && source['message'][0]['type'] == 'json'){
				try{
					let music_json = JSON.parse(source['message'][0]['data']);
					if(music_json['view'] == 'music'){
						let music = music_json.meta.music;
						await e.reply('开始上传['+music.title + '-' + music.desc+']。。。');
						await e.reply(await uploadRecord(music.musicUrl,0,!reg[1].includes('高清')));
					}
				}catch(err){}
				return true;
			}
		}

		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data;
		if(!data[key] || (new Date().getTime() - data[key].time) > (1000 * 60)){
			return false;
		}
		
		if((reg[1]?.includes('语音') || reg[1]?.includes('歌词')) && !reg[2]){
			reg[2] = String(data[key].index + 1);
		}
		
		let index = Number(reg[2]) - 1;		
		
		if(data[key].data.length > index && index > -1){
			if(data[key].page < 1 && (!reg[1]?.includes('语音') && !reg[1]?.includes('歌词'))){
				return false;
			}
			data[key].index = index;
			let music = data[key].data[index];

			if(!reg[1]?.includes('歌词')){
				let music_json = await CreateMusicShareJSON(music);
				if(reg[1] && reg[1].includes('语音')){
					await e.reply('开始上传['+music.name + '-' + music.artist+']。。。');
					let result = await uploadRecord(music_json.meta.music.musicUrl,0,!reg[1].includes('高清'));
					if(!result){
						result = '上传['+music.name + '-' + music.artist+']失败！\n'+music_json.meta.music.musicUrl;
					}
					await e.reply(result);
					return true;
				}

				let ArkSend = await ArkMsg.Share(JSON.stringify(music_json),e);
				if(ArkSend.code != 1){
					let body = await CreateMusicShare(e,music);
					await SendMusicShare(body);
				}
				//await recallMusicMsg(key,data[key].msg_results);
				//delete data[key];
			}else{
				try{
					typeof(music.lrc) == 'function' ? music.lrc = await music.lrc(music.data) : music.lrc = music.lrc;
					if(music.lrc == null && typeof(music.api) == 'function'){
						await music.api(music.data,['lrc'],music);
					}
				}catch(err){}
				
				let lrc = music.lrc || '没有查询到这首歌的歌词！';
				let lrc_text = [];
				let lrc_reg = /\[.*\](.*)?/gm;

				let exec;
				while(exec = lrc_reg.exec(lrc)){
					if(exec[1]){
						lrc_text.push(exec[1]);
					}
				}

				let user_info = {
					nickname: Bot.nickname,
					user_id: Bot.uin
				};
				let MsgList = [];

				if(lrc_text.length > 0){
					MsgList.push({
						...user_info,
						message: `---${music.name}-${music.artist}---\n${lrc_text.join('\n')}`
					});
				}

				MsgList.push({
					...user_info,
					message: `---${music.name}-${music.artist}---\n${lrc}`
				});

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
	if(!reg[2]) reg[2] = '';

	let music_source = {
		'网易': 'netease',
		'网易云': 'netease',
		'酷我': 'kuwo',
		'酷狗': 'kugou',
		'qq': 'qq',
		'QQ': 'qq'
	};

	let setting = Config.getdefSet('setting','system') || {};
	source = music_source[reg[3]] || (music_source[setting['music_source']] || 'qq');
	
	try{
		let arr = Object.entries(music_source);
		let index = Object.values(music_source).indexOf(source);
		reg[3] = arr[index][0] || reg[3];
	}catch(err){}

	source = [source, reg[3]];

	if(search == '' && reg[4] != '下一页' && reg[4] != '个性电台'){
		let help = "------点歌说明------\r\n格式：#点歌 #多选点歌\r\n支持：QQ、网易、酷我、酷狗\r\n例如：#QQ点歌 #多选QQ点歌"
		await e.reply(help,true);
		return true;
	}

	if(setting['is_list'] == true) reg[2] = '多选';
	
	let temp_data = {};
	let page = reg[2] == '多选' ? 1 : 0;
	let page_size = reg[2] == '多选' ? _page_size : 10;

	if(reg[4] == '个性电台'){
		if(source[0] != 'qq'){
			await e.reply(`暂不支持${source[1]}个性电台！`,true);
			return true;
		}
		search = e.user_id;
		source = ['qq_radio','QQ个性电台'];
		page = 0;
		page_size = 5;
		e.reply('请稍候。。。',true);
	}
	
	if(reg[4] == '下一页'){
		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data;
		if(!data[key] || (new Date().getTime() - data[key].time) > (1000 * 60) || data[key].page < 1){
			return false;
		}
		data[key].time = new Date().getTime();//续期，防止搜索时清除
		page_size = _page_size;
		page = data[key].page + 1;
		search = data[key].search;
		source = data[key].source;
		temp_data = data[key];//上一页的列表数据
	}
	
	return music_handle(e, search, source, page, page_size, temp_data);
}

async function music_handle(e, search, source, page = 0, page_size = 10, temp_data = {}){
	let result = await music_search(search, source[0], page == 0 ? 1 : page, page_size);
	if(result && result.data && result.data.length > 0){
		let key = get_MusicListId(e);
		let data = xiaofei_plugin.music_temp_data;
		if(data[key]?.msg_results && page < 2){
			recallMusicMsg(key,data[key].msg_results);//撤回上一条多选点歌列表
		}
		
		data = {};
		
		if(page > 0){
			let message = [`---${source[1]}点歌列表---`];
			for(let i in result.data){
				let music = result.data[i];
				let index = Number(i) + 1;
				if(page > 1){
					index = ((page - 1) * 10) + index;
				}
				message.push(index + '.' + music.name + '-' + music.artist);
			}
			message.push('----------------');
			message.push('提示：请在一分钟内发送序号进行点歌，发送【#下一页】查看更多！');
			let msg_result = [];

			let setting = Config.getdefSet('setting','system') || {};
			if(setting['is_cardlist'] == true){
				let json_result = await ShareMusic_JSONList(e,result.data, page, page_size, source[1]);
				json_result = await ArkMsg.Share(JSON.stringify(json_result.data),e,null,null,true);
				msg_result.push(json_result.message);
			}

			if(e.guild_id){//频道的话发文字，图片不显示。。。
				msg_result.push(e.reply(message.join("\r\n")));
			}else{
				msg_result.push(new Promise(async (resolve, reject) => {
					resolve(await e.reply(await ShareMusic_HtmlList(result.data, page, page_size, source[1])));//生成图片列表
				}));
			}

			if(msg_result.length < 1){//消息发送失败，使用转发消息发送
				let nickname = Bot.nickname;
				if (e.isGroup) {
					let info = await Bot.getGroupMemberInfo(e.group_id, Bot.uin)
					nickname = info.card || info.nickname;
					if(e.at && !e.atBot){
						return false;
					}
				}
				
				let MsgList = [];
				let user_info = {
					nickname: nickname,
					user_id: Bot.uin
				};
				
				MsgList.push({
					...user_info,
					message: message.join("\r\n"),
				});
				let forwardMsg = await Bot.makeForwardMsg(MsgList);
				
				msg_result.push(await e.reply(forwardMsg));
			}
			
			if(page > 1){
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
					index: -1
				};
			}else{
				data = {
					time: new Date().getTime(),
					data: result.data,
					page: result.page,
					msg_results: [msg_result],
					search: search,
					source: source,
					index: -1
				};
			}
		}else{
			if(source[0] == 'qq_radio'){
				let nickname = e.sender.nickname;
				if(e.isGroup){
					let info = await Bot.getGroupMemberInfo(e.group_id, e.user_id)
					nickname = info.card || info.nickname;
				}
				
				let user_info = {
					nickname: nickname,
					user_id: e.user_id
				};

				let MsgList = [];
				let index = 1;
				for(let music of result.data){
					let music_json = await CreateMusicShareJSON({
						...music,
						app_name: 'QQ音乐个性电台'
					});

					music = music_json.meta.music;
					music.tag = index + '.' + music.tag;
					
					let json_sign = await ArkMsg.Sign(JSON.stringify(music_json));
					if(json_sign.code == 1){
						music_json = json_sign.data;
					}
					MsgList.push({
						...user_info,
						message: segment.json(music_json)
					});
					index++;
				}
				let forwardMsg = await Bot.makeForwardMsg(MsgList);
				forwardMsg.data = forwardMsg.data
				.replace('<?xml version="1.0" encoding="utf-8"?>','<?xml version="1.0" encoding="utf-8" ?>')
				.replace(/\n/g, '')
				.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
				.replace(/___+/, `<title color="#777777" size="26">根据QQ[${search}]的听歌口味为您推荐</title>`);
				await e.reply(forwardMsg);
				data = {
					time: new Date().getTime(),
					data: result.data,
					page: 0,
					msg_results: [],
					search: search,
					source: source,
					index: -1
				};
			}else{
				let music = result.data[0];
				data = {
					time: new Date().getTime(),
					data: [music],
					page: 0,
					msg_results: [],
					search: search,
					source: source,
					index: 0
				};

				let music_json = await CreateMusicShareJSON(music);
				let ArkSend = await ArkMsg.Share(JSON.stringify(music_json),e);
				if(ArkSend.code != 1){
					let body = await CreateMusicShare(e,music);
					await SendMusicShare(body);
				}
			}
		}
		xiaofei_plugin.music_temp_data[get_MusicListId(e)] = data;
	}else{
		if(page > 1){
			await e.reply('没有找到更多歌曲！',true);
		}else{
			await e.reply('没有找到该歌曲！',true);
		}
	}
	return true;
	
}


async function ShareMusic_JSONList(e, list, page, page_size, source = ''){
	let json = {
		"app": "com.tencent.bot.task.deblock",
		"config": {
			"autosize": 1,
			"type": "normal",
			"showSender":0
		},
		"meta": {
			"detail": {
				"appID": "",
				"battleDesc": "",
				"botName": "Yunzai-Bot",
				"cmdList": [{
					"cmdDesc": "进行点歌",
					"cmd": " 歌曲序号",
					"cmdTitle": "发送"
				  },
				  {
					"cmdDesc": "查看更多",
					"cmd": " #下一页",
					"cmdTitle": "发送"
				  },{
					"cmdDesc": "播放语音",
					"cmd": " #(高清)语音+序号",
					"cmdTitle": "发送"
				  },{
					"cmdDesc": "查看歌词",
					"cmd": " #歌词+序号",
					"cmdTitle": "发送"
				  }],
				"cmdTitle": "可在一分钟内发送以下指令:",
				"content": "",
				"guildID": "",
				"iconLeft": [],
				"iconRight": [],
				"receiverName": "@小飞",
				"subGuildID": "SUBGUILDID#",
				"title": "",
				"titleColor": ""
			}
		},
		"prompt": "",
		"ver": "2.0.4.0",
		"view": "index"
	};
	json.prompt = `${source}点歌列表`;
	json.meta.detail.receiverName = `@${e.nickname}`;
	json.meta.detail.title = `---${source}点歌列表---`;
	let music_list = [];
	
	for(let i in list){
		let music = list[i];
		let index = Number(i) + 1;
		if(page > 1){
			index = ((page - 1) * page_size) + index;
		}
		music_list.push(`${index}.${music.name}-${music.artist}`);
	}

	json.meta.detail.content = music_list.join("\n");

	return {data: json};
	let json_sign = await ArkMsg.Sign(JSON.stringify(json));
	if(json_sign.code == 1){
		return segment.json(json_sign.data);
	}
	return false;
}

async function ShareMusic_HtmlList(list, page, page_size, source = ''){//来自土块插件（earth-k-plugin）的列表样式（已修改）
	let new_list = [];
	for(let i in list){
		let music = list[i];
		let index = Number(i) + 1;
		if(page > 1){
			index = ((page - 1) * page_size) + index;
		}
		new_list.push({
			index: index,
			name: music.name,
			artist: music.artist,
		});
	}



	let background_path = `${Plugin_Path}/resources/html/music_list/bg/bg${String(random(1,13))}.jpg`;
	let background_url = await get_background();
	if(background_url){
		try{
			let response = await fetch(background_url);
			let buffer = await response.buffer();
			if(buffer){
				background_path = 'data:image/jpg;base64,' + buffer.toString('base64');
			}
		}catch(err){}
	}

	let data = {
		plugin_path: Plugin_Path,
		background_path: background_path,
		title: `${source.split('').join(' ')} 点 歌 列 表`,
		tips: '提示：请在一分钟内发送序号进行点歌，发送【#下一页】查看更多！',
		sub_title: `Created By Yunzai-Bot ${Version.yunzai} & xiaofei-Plugin ${Version.ver}`,
		list: new_list,
	};

	let saveId = String(new Date().getTime());

	let img = await puppeteer.screenshot("xiaofei-plugin/music_list", {
		saveId: saveId,
		tplFile: `${Plugin_Path}/resources/html/music_list/index.html`,
		data: data,
	});
	fs.unlink(`${process.cwd()}/data/html/xiaofei-plugin/music_list/${saveId}.html`,err => {});
	return img;
}

function get_MusicListId(e){
	let id = '';
	if(e.guild_id){
		id = `guild_${e.channel_id}_${e.guild_id}`;
	}else if(e.group){
		id = `group_${e.group.gid}_${e.user_id}`;
	}else{
		id = `friend_${e.user_id}`;
	}
	return `${id}`;
}

async function get_background(){
	let background_url = '';
	let api = 'https://content-static.mihoyo.com/content/ysCn/getContentList?channelId=313&pageSize=1000&pageNum=1&isPreview=0';
	try{
		let response = await fetch(api); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		if(res.retcode == 0 && res.data?.list){
			let list = res.data.list;
			let data = list[random(0,list.length-1)].ext[0];
			if(data.value && data.value.length > 0){
				background_url = data.value[random(0,data.value.length-1)].url;
			}
		}
	}catch(err){
	}
	return background_url;
}

async function music_search(search,source,page = 1,page_size = 10){
	let list = [];
	let result = [];
	
	let value = {
		netease: {
			name: 'name',id: 'id',
			artist: (data) => {
				let ars = [];
				for(let index in data.ar){
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
				if(data.privilege && data.privilege.plLevel == 'none'){
					try{
						let cookie = music_cookies.netease?.ck;
						cookie = cookie ? cookie : '';
						let options = {
							method: 'POST',//post请求 
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 12; MI Build/SKQ1.211230.001)',
								'Cookie': cookie
							},
							body: `ids=${JSON.stringify([data.id])}&level=standard&encodeType=mp3`
						};
						let response = await fetch('https://music.163.com/api/song/enhance/player/url/v1',options); //调用接口获取数据
						let res = await response.json(); //结果json字符串转对象
						if(res.code == 200){
							url = res.data[0]?.url;
							url = url ? url : '';
						}
					}catch(err){}
				}
				return url;
			},
			lrc: async (data) => {
				let url = `https://music.163.com/api/song/lyric?id=${data.id}&lv=-1&tv=-1`;
				try{
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'https://music.163.com/'
						}
					};
					let response = await fetch(url,options); //调用接口获取数据
					let res = await response.json();
					if(res.code == 200 && res.lrc?.lyric){
						return res.lrc.lyric;
					}
				}catch(err){}
				return '没有查询到这首歌的歌词！';
			}
		},
		kuwo: {
			name: 'SONGNAME',id: 'MUSICRID',artist: 'ARTIST',
			pic1: async (data) => {
				let url = `http://artistpicserver.kuwo.cn/pic.web?type=rid_pic&pictype=url&content=list&size=320&rid=${data.MUSICRID.substring(6)}`;
				let response = await fetch(url); //调用接口获取数据
				let res = await response.text();
				url = '';
				if(res && res.indexOf('http') != -1){
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
				let url = `http://antiserver.kuwo.cn/anti.s?useless=/resource/&format=mp3&rid=${data.MUSICRID}&response=res&type=convert_url3&br=320kmp3`;
				let response = await fetch(url); //调用接口获取数据
				let res = await response.json(); //结果json字符串转对象
				if(res && res.url){
					url = res.url;
				}
				return url;
			},
			lrc: async (data) => {
				try{
					let url = `http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${data.MUSICRID.substring(6)}`;
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'http://www.kuwo.cn/'
						}
					};
					let response = await fetch(url,options); //调用接口获取数据
					let res = await response.json();
					if(res.data?.lrclist){
						let lrc = [];
						for(let val of res.data.lrclist){
							let i = parseInt((Number(val.time) / 60) % 60); if(String(i).length < 2) i = `0${i}`;
							let s = parseInt(Number(val.time) % 60); if(String(s).length < 2) s = `0${s}`;
							let ms = val.time.split('.')[1] || '00'; if(ms.length > 3) ms = ms.substring(0,3);
							lrc.push(`[${i}:${s}.${ms}]${val.lineLyric}`);
						}
						return lrc.join('\n');
					}
				}catch(err){}
				return '没有查询到这首歌的歌词！';
			}
		},
		qq: {
			name: (data) => {
				let name = data.title;
				return name.replace(/\<(\/)?em\>/g,''); 
			},
			id: 'mid',
			artist: (data) => {
				let ars = [];
				for(let index in data.singer){
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
				let code = md5(`${data.mid}q;z(&l~sdf2!nK`,32).substring(0,5).toLocaleUpperCase();
				let play_url = `http://c6.y.qq.com/rsc/fcgi-bin/fcg_pyq_play.fcg?songid=&songmid=${data.mid}&songtype=1&fromtag=50&uin=${Bot.uin}&code=${code}`;
				if(data.pay?.pay_play == 1){//需要付费
					let json_body = {
						...music_cookies.qqmusic.body,
						"req_0":{"module":"vkey.GetVkeyServer","method":"CgiGetVkey","param":{"guid":md5(String(new Date().getTime()),32),"songmid":[],"songtype":[0],"uin":"0"}}
					};
					json_body.req_0.param.songmid = [data.mid];
					let options = {
						method: 'POST',//post请求 
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'Cookie': ''
						},
						body: JSON.stringify(json_body)
					};
					
					let url = `http://u6.y.qq.com/cgi-bin/musicu.fcg`;
					try{
						let response = await fetch(url,options); //调用接口获取数据
						let res = await response.json();
						if(res.req_0 && res.req_0?.code == '0'){
							let midurlinfo = res.req_0.data.midurlinfo;
							let purl = '';
							if(midurlinfo && midurlinfo.length > 0){
								purl = midurlinfo[0].purl;
								if(purl) play_url = 'http://ws.stream.qqmusic.qq.com/' + purl;
							}
						}
					}catch(err){}
				}
				return play_url;
			},
			lrc: async (data) => {
				let url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?_=${new Date().getTime()}&cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=0&g_tk_new_20200303=5381&g_tk=5381&loginUin=0&songmid=${data.mid}`;
				try{
					let options = {
						method: 'GET',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/105.0.0.0 Safari/537.36 Edg/105.0.1343.42',
							'Referer': 'https://y.qq.com/'
						}
					};
					let response = await fetch(url,options); //调用接口获取数据
					let res = await response.json();
					if(res.lyric){
						return Buffer.from(res.lyric,'base64').toString();
					}
				}catch(err){}
				return '没有查询到这首歌的歌词！';
			}
		},
		kugou: {
			name: 'songname',id: 'hash',artist: 'singername',
			pic: null,
			link: (data) => {
				let url = `http://www.kugou.com/song/#hash=${data.hash}&album_id=${data.album_id}`;
				return url;
			},
			url: null,
			lrc: null,
			api: async (data,types,music_data = {}) => {
				let hash = data.hash;
				let album_id = data.album_id;
				let url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&dfid=&appid=1014&mid=1234567890&platid=4&album_id=${album_id}&_=${new Date().getTime()}`;
				let response = await fetch(url); //调用接口获取数据
				let res = await response.json(); //结果json字符串转对象
				
				if(res.status != 1){
					return music_data;
				}
				data = res.data;
				
				if(types.indexOf('pic') > -1){
					music_data.pic = data.img ? data.img : no_pic;
				}
				if(types.indexOf('url') > -1){
					let key = md5(`${hash}mobileservice`,32);
					music_data.url = `https://m.kugou.com/api/v1/wechat/index?cmd=101&hash=${hash}&key=${key}`;//播放直链
					//如果直链失效了再取消注释下面
					//music_data.url = data.play_url ? data.play_url : result.url;
				}
				if(types.indexOf('lrc') > -1){
					music_data.lrc = data.lyrics || '没有查询到这首歌的歌词！';
				}
				return music_data;
			}
		}
	};
	
	switch(source){
		case 'netease':
			result = await netease_search(search,page,page_size);
			break;
		case 'kuwo':
			result = await kuwo_search(search,page,page_size);
			break;
		case 'kugou':
			result = await kugou_search(search,page,page_size);
			break;
		case 'qq_radio':
			source = 'qq';
			result = await qqmusic_radio(search,page_size);
			break;
		case 'qq':
		default:
			source = 'qq';
			result = await qqmusic_search(search,page,page_size);
			break;
	}
	if(result && result.data && result.data.length > 0){
		page = result.page;
		result = result.data;
		for(let i in result){
			let data = result[i];
			let name = value[source].name;name = typeof(name) == 'function' ? await name(data) : data[name];
			let id = data[value[source].id];if(source == 'kuwo'){id = id.substring(6);}
			let artist = value[source].artist;artist = typeof(artist) == 'function' ? await artist(data) : data[artist];
			let pic = value[source].pic;pic = typeof(pic) == 'function' ? pic/*await pic(data)*/ : data[pic];
			let link = value[source].link;link = typeof(link) == 'function' ? link(data) : data[link];
			let url = value[source].url;url = typeof(url) == 'function' ? url/*await url(data)*/ : data[url];
			let lrc = value[source].lrc;lrc = typeof(lrc) == 'function' ? lrc/*await lrc(data)*/ : data[lrc];
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
	return {page: page,data: list};
}

async function CreateMusicShareJSON(data){
	let music_json = {"app":"com.tencent.structmsg","desc":"音乐","view":"music","ver":"0.0.0.1","prompt":"","meta":{"music":{"app_type":1,"appid":0,"desc":"","jumpUrl":"","musicUrl":"","preview":"","sourceMsgId":"0","source_icon":"","source_url":"","tag":"","title":""}},"config":{"type":"normal","forward":true}};
	let music = music_json.meta.music;

	let appid, app_name, app_icon;
	switch(data.source){
		case 'netease':
			appid = 100495085;
			app_name = '网易云音乐';
			app_icon = 'https://i.gtimg.cn/open/app_icon/00/49/50/85/100495085_100_m.png';
			
			break;
		case 'kuwo':
			appid = 100243533
			app_name = '酷我音乐';
			app_icon = 'https://p.qpic.cn/qqconnect/0/app_100243533_1636374695/100?max-age=2592000&t=0';
			break;
		case 'kugou':
			appid = 205141;
			app_name = '酷狗音乐';
			app_icon = 'https://open.gtimg.cn/open/app_icon/00/20/51/41/205141_100_m.png?t=0';
			break;
		case 'qq':
		default:
			appid = 100497308;
			app_name = 'QQ音乐';
			app_icon = 'https://p.qpic.cn/qqconnect/0/app_100497308_1626060999/100?max-age=2592000&t=0';
			break;
	}
	
	var title = data.name, singer = data.artist, prompt = '[分享]', jumpUrl, preview, musicUrl;

	let types = [];
	if(data.url == null){types.push('url')};
	if(data.pic == null){types.push('pic')};
	if(data.link == null){types.push('link')};
	if(types.length > 0 && typeof(data.api) == 'function'){
		let {url,pic,link} = await data.api(data.data,types);
		if(url){data.url = url;}
		if(pic){data.pic = pic;}
		if(link){data.link = link;}
	}
	
	typeof(data.url) == 'function' ? musicUrl = await data.url(data.data) : musicUrl = data.url;
	typeof(data.pic) == 'function' ? preview = await data.pic(data.data) : preview = data.pic;
	typeof(data.link) == 'function' ? jumpUrl = await data.link(data.data) : jumpUrl = data.link;
	
	data.url = musicUrl;
	
	if(typeof(musicUrl) != 'string' || musicUrl == ''){
		style = 0;
		musicUrl = '';
	}
	
	if(data.prompt){
		prompt = '[分享]' + data.prompt;
	}else{
		prompt = '[分享]' + title + '-' + singer;
	}

	app_name = data.app_name || app_name;
	if(typeof(data.config) == 'object') music_json.config = data.config;

	music.appid = appid;
	music.desc = singer;
	music.jumpUrl = jumpUrl;
	music.musicUrl = musicUrl;
	music.preview = preview;
	music.title = title;
	music.appid = appid;
	music.tag = `小飞插件[${app_name}]`;
	music.source_icon = app_icon;
	music_json.prompt = prompt;
	
	return music_json;
}

async function CreateMusicShare(e,data,to_uin = null){
	let appid, appname, appsign, style = 4;
	switch(data.source){
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
	
	var text = '',title = data.name, singer = data.artist, prompt = '[分享]', jumpUrl, preview, musicUrl;

	if(data.text){
		text = data.text;
	}
	
	let types = [];
	if(data.url == null){types.push('url')};
	if(data.pic == null){types.push('pic')};
	if(data.link == null){types.push('link')};
	if(types.length > 0 && typeof(data.api) == 'function'){
		let {url,pic,link} = await data.api(data.data,types);
		if(url){data.url = url;}
		if(pic){data.pic = pic;}
		if(link){data.link = link;}
	}
	
	typeof(data.url) == 'function' ? musicUrl = await data.url(data.data) : musicUrl = data.url;
	typeof(data.pic) == 'function' ? preview = await data.pic(data.data) : preview = data.pic;
	typeof(data.link) == 'function' ? jumpUrl = await data.link(data.data) : jumpUrl = data.link;
	
	data.url = musicUrl;
	
	if(typeof(musicUrl) != 'string' || musicUrl == ''){
		style = 0;
		musicUrl = '';
	}
	
	if(data.prompt){
		prompt = '[分享]' + data.prompt;
	}else{
		prompt = '[分享]' + title + '-' + singer;
	}
	
	let recv_uin = 0;
	let send_type = 0;
	let recv_guild_id = 0;
	
	if(e.isGroup && to_uin == null){//群聊
		recv_uin = e.group.gid;
		send_type = 1;
	}else if(e.guild_id){//频道
		recv_uin = Number(e.channel_id);
		recv_guild_id = BigInt(e.guild_id);
		send_type = 3;
	}else if(to_uin == null){//私聊
		recv_uin = e.friend.uid;
		send_type = 0;
	}else{//指定号码私聊
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

async function SendMusicShare(body){

	let payload = await Bot.sendOidb("OidbSvc.0xb77_9", core.pb.encode(body));
	
	let result = core.pb.decode(payload);

	if(result[3] != 0){
		e.reply('歌曲分享失败：'+result[3],true);
	}
}

async function get_netease_userinfo(ck = null){
	try{
		let url = 'https://interface.music.163.com/api/nuser/account/get';
		let options = {
			method: 'GET',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': ck || music_cookies.netease.ck
			}
		};

		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json();
		if(res?.code == '200' && res.profile){
			let profile = res.profile;
			let account = res.account;
			return {code: 1,data: {
				userid: profile.userId,
				nickname: profile.nickname,
				is_vip: account?.vipType != 0
			}};
		}
	}catch(err){}
	return {code: -1};
}


async function get_qqmusic_userinfo(ck = null){
	try{
		let url = `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?_=${new Date().getTime()}&cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&uin=0&g_tk_new_20200303=5381&g_tk=5381&cid=205360838&userid=0&reqfrom=1&reqtype=0&hostUin=0&loginUin=0`;
		let cookies = [];
		ck = ck || music_cookies.qqmusic.ck;

		for(let key of ck.keys()){
			let value = ck.get(key);
			if(value){
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

		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json();
		if(res?.code == '0' && res.data?.creator){
			let creator = res.data.creator;
			return {code: 1,data: {
				userid: ck.get('uin') || ck.get('wxuin'),
				nickname: creator.nick,
				is_vip: await is_qqmusic_vip(ck.get('uin') || ck.get('wxuin'))
			}};
		}
	}catch(err){}
	return {code: -1};
}

async function is_qqmusic_vip(uin,cookies = null){
	let json = {"comm":{"cv":4747474,"ct":24,"format":"json","inCharset":"utf-8","outCharset":"utf-8","notice":0,"platform":"yqq.json","needNewCode":1,"uin":0,"g_tk_new_20200303":5381,"g_tk":5381},
	"req_0":{"module":"userInfo.VipQueryServer",
	"method":"SRFVipQuery_V2",
	"param":{
		"uin_list":[uin]
	}}};
	
	let options = {
		method: 'POST',//post请求 
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookies || Bot.cookies['y.qq.com']
			},
		body: JSON.stringify(json)
	};
	
	let url = `http://u6.y.qq.com/cgi-bin/musicu.fcg`;
	try{
		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json();
		if(res.req_0 && res.req_0?.code == '0'){
			let data = res.req_0.data?.infoMap?.[uin];
			if(data.iVipFlag == 1 || data.iSuperVip == 1 || data.iNewVip == 1 || data.iNewSuperVip == 1){
				return true;
			}
		}
	}catch(err){}
	return false;
}

async function kugou_search(search,page = 1,page_size = 10){
	try{
		let url = `http://msearchcdn.kugou.com/api/v3/search/song?page=${page}&pagesize=${page_size}&keyword=${encodeURI(search)}`;
		let response = await fetch(url,{ method: "get" }); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		if(!res.data || res.data.info < 1){
			return [];
		}
		return {page: page,data: res.data.info};
	}catch(err){}
	
	return null;
}


async function qqmusic_refresh_token(cookies,type){
	let result = {code: -1};
	let json_body = {
		...music_cookies.qqmusic.body,
		req_0: {
			"method" : "Login",
			"module" : "music.login.LoginServer",
			"param" : {
			   "access_token" : "",
			   "expired_in" : 0,
			   "forceRefreshToken" : 0,
			   "musicid" : 0,
			   "musickey" : "",
			   "onlyNeedAccessToken" : 0,
			   "openid" : "",
			   "refresh_token" : "",
			   "unionid" : ""
			}
		}
	};
	let req_0 = json_body.req_0;
	if(type == 0){
		req_0.param.appid = 100497308;
		req_0.param.access_token = cookies.get("psrf_qqaccess_token") || '';
		req_0.param.musicid = Number(cookies.get("uin") || '0');
		req_0.param.openid = cookies.get("psrf_qqopenid") || '';
		req_0.param.refresh_token = cookies.get("psrf_qqrefresh_token") || '';
		req_0.param.unionid = cookies.get("psrf_qqunionid") || '';
	}else if(type == 1){
		req_0.param.strAppid = "wx48db31d50e334801";
		req_0.param.access_token = cookies.get("wxaccess_token") || '';
		req_0.param.str_musicid = cookies.get("wxuin") || '0';
		req_0.param.openid = cookies.get("wxopenid") || '';
		req_0.param.refresh_token = cookies.get("wxrefresh_token") || '';
		req_0.param.unionid = cookies.get("wxunionid") || '';
	}else{
		return result;
	}
	req_0.param.musickey = (cookies.get("qqmusic_key") || cookies.get("qm_keyst")) || '';

	let options = {
		method: 'POST',//post请求 
		headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
		body: JSON.stringify(json_body)
	};
	
	let url = `http://u.y.qq.com/cgi-bin/musicu.fcg`;
	try{
		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		if(res.req_0?.code == '0'){
			let map = new Map();
			let data = res.req_0?.data;
			if(type == 0){
				map.set("psrf_qqopenid",data.openid);
				map.set("psrf_qqrefresh_token",data.refresh_token);
				map.set("psrf_qqaccess_token",data.access_token);
				map.set("psrf_access_token_expiresAt",data.expired_at);
				map.set("uin",String(data.str_musicid || data.musicid) || '0');
				map.set("qqmusic_key",data.musickey);
				map.set("qm_keyst",data.musickey);
				map.set("psrf_musickey_createtime",data.musickeyCreateTime);
				map.set("psrf_qqunionid",data.unionid);
				map.set("euin",data.encryptUin);
				map.set("login_type",1);
				map.set("tmeLoginType",2);
				result.code = 1;
				result.data = map;
			}else if(type == 1){
				map.set("wxopenid",data.openid);
				map.set("wxrefresh_token",data.refresh_token);
				map.set("wxaccess_token",data.access_token);
				map.set("wxuin",String(data.str_musicid || data.musicid) || '0');
				map.set("qqmusic_key",data.musickey);
				map.set("qm_keyst",data.musickey);
				map.set("psrf_musickey_createtime",data.musickeyCreateTime);
				map.set("wxunionid",data.unionid);
				map.set("euin",data.encryptUin);
				map.set("login_type",2);
				map.set("tmeLoginType",1);
				result.code = 1;
				result.data = map;
			}
		}
	}catch(err){
		logger.error(err);
	}
	return result;
}

async function qqmusic_radio(uin,page_size){
	try{
		let json_body = {
			...JSON.parse(JSON.stringify(music_cookies.qqmusic.body)),
			"req_0":{"method":"get_radio_track","module":"pc_track_radio_svr","param":{"id":99,"num":1}}
		};
		json_body.comm.guid = md5(String(new Date().getTime()),32);
		json_body.comm.uin = uin;
		json_body.comm.tmeLoginType = 2;
		json_body.comm.psrf_qqunionid = '';
		json_body.comm.authst = '';
		json_body.req_0.param.num = page_size;
	
		let options = {
			method: 'POST',//post请求 
			headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
			body: JSON.stringify(json_body)
		};
		
		let url = `http://u.y.qq.com/cgi-bin/musicu.fcg`;
		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		
		if(res.code != '0' && res.req_0.code != '0'){
			return null;
		}
	
		let data = res.req_0?.data?.tracks;
		data = data ? data : [];
		return {page: 1,data: data};
	}catch(err){}
	
	return null;
}

async function qqmusic_search(search,page = 1,page_size = 10){
	try{
		let qq_search_json = {"search":{"module":"music.search.SearchBrokerCgiServer","method":"DoSearchForQQMusicMobile","param":{"query":"","highlight":1,"searchid":"123456789","sub_searchid":0,"search_type":0,"nqc_flag":0,"sin":0,"ein":30,"page_num":1,"num_per_page":10,"cat":2,"grp":1,"remoteplace":"search.android.defaultword","multi_zhida":1,"sem":0}}};
	
		qq_search_json['search']['param']['searchid'] = new Date().getTime();
		qq_search_json['search']['param']['query'] = search;
		qq_search_json['search']['param']['page_num'] = page;
		qq_search_json['search']['param']['num_per_page'] = page_size;
		
		let options = {
			method: 'POST',//post请求 
			headers: { 'Content-Type': 'application/x-www-form-urlencoded'},
			body: JSON.stringify(qq_search_json)
		};
		
		let url = `http://u.y.qq.com/cgi-bin/musicu.fcg`;
	
		let response = await fetch(url,options); //调用接口获取数据
		
		let res = await response.json(); //结果json字符串转对象
		
		if(res.code != '0'){
			return null;
		}
		return {page: page,data: res.search.data.body.item_song};
	}catch(err){}

	return null;
}

async function netease_search(search,page = 1,page_size = 10){
	try{
		let url = 'http://music.163.com/api/cloudsearch/pc';
		let options = {
			method: 'POST',//post请求 
			headers: { 'Content-Type': ' application/x-www-form-urlencoded'},
			body: `offset=${page-1}&limit=${page_size}&type=1&s=${encodeURI(search)}`
		};

		let response = await fetch(url,options); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		
		if(res.result.songs < 1){
		return null;
		}
		return {page: page,data: res.result.songs};
	}catch(err){}
	
	return null;
}
	
async function kuwo_search(search,page = 1,page_size = 10){
	try{
		let url = `http://search.kuwo.cn/r.s?user=&android_id=&prod=kwplayer_ar_10.1.2.1&corp=kuwo&newver=3&vipver=10.1.2.1&source=kwplayer_ar_10.1.2.1_40.apk&p2p=1&q36=&loginUid=&loginSid=&notrace=0&client=kt&all=${search}&pn=${page-1}&rn=${page_size}&uid=&ver=kwplayer_ar_10.1.2.1&vipver=1&show_copyright_off=1&newver=3&correct=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&searchapi=5&issubtitle=1&province=&city=&latitude=&longtitude=&userIP=&searchNo=&spPrivilege=0`;
		let response = await fetch(url,{ method: "get" }); //调用接口获取数据
		let res = await response.json(); //结果json字符串转对象
		if(res.abslist.length < 1){
			return null;
		}
		return {page: page,data:res.abslist};
	}catch(err){}

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
	return cookieMap||{};
}

function random(min,max){
	 //如生成3位的随机数就定义100-999；
	//const max = 100;
	//const min = 999;
	//生成6位的随机数就定义100000-999999之间
	//const min    = 100000;                            //最小值
	//const max    = 999999;                            //最大值
	const range  = max - min;                         //取值范围差
	const random = Math.random();                     //小于1的随机数
	const result = min + Math.round(random * range);  //最小数加随机数*范围差 
	//————————————————
	//版权声明：本文为CSDN博主「浪里龙小白丶」的原创文章，遵循CC 4.0 BY-SA版权协议，转载请附上原文出处链接及本声明。
	//原文链接：https://blog.csdn.net/m0_51317381/article/details/124499851
	return result;
}

/*
休眠函数sleep
调用 await sleep(1500)
 */
function sleep(ms) {
    return new Promise(resolve=>setTimeout(resolve, ms))
}

function md5(string,bit) {
    function md5_RotateLeft(lValue, iShiftBits) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function md5_AddUnsigned(lX, lY) {
        var lX4, lY4, lX8, lY8, lResult;
        lX8 = (lX & 0x80000000);
        lY8 = (lY & 0x80000000);
        lX4 = (lX & 0x40000000);
        lY4 = (lY & 0x40000000);
        lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) {
            return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        }
        if (lX4 | lY4) {
            if (lResult & 0x40000000) {
                return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            } else {
                return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
            }
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }
    function md5_F(x, y, z) {
        return (x & y) | ((~x) & z);
    }
    function md5_G(x, y, z) {
        return (x & z) | (y & (~z));
    }
    function md5_H(x, y, z) {
        return (x ^ y ^ z);
    }
    function md5_I(x, y, z) {
        return (y ^ (x | (~z)));
    }
    function md5_FF(a, b, c, d, x, s, ac) {
        a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_F(b, c, d), x), ac));
        return md5_AddUnsigned(md5_RotateLeft(a, s), b);
    };
    function md5_GG(a, b, c, d, x, s, ac) {
        a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_G(b, c, d), x), ac));
        return md5_AddUnsigned(md5_RotateLeft(a, s), b);
    };
    function md5_HH(a, b, c, d, x, s, ac) {
        a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_H(b, c, d), x), ac));
        return md5_AddUnsigned(md5_RotateLeft(a, s), b);
    };
    function md5_II(a, b, c, d, x, s, ac) {
        a = md5_AddUnsigned(a, md5_AddUnsigned(md5_AddUnsigned(md5_I(b, c, d), x), ac));
        return md5_AddUnsigned(md5_RotateLeft(a, s), b);
    };
    function md5_ConvertToWordArray(string) {
        var lWordCount;
        var lMessageLength = string.length;
        var lNumberOfWords_temp1 = lMessageLength + 8;
        var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        var lWordArray = Array(lNumberOfWords - 1);
        var lBytePosition = 0;
        var lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    };
    function md5_WordToHex(lValue) {
        var WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            WordToHexValue_temp = "0" + lByte.toString(16);
            WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
        }
        return WordToHexValue;
    };
    function md5_Utf8Encode(string) {
        string = string.replace(/\r\n/g, "\n");
        var utftext = "";
        for (var n = 0; n < string.length; n++) {
            var c = string.charCodeAt(n);
            if (c < 128) {
                utftext += String.fromCharCode(c);
            } else if ((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            } else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }
        }
        return utftext;
    };
    var x = Array();
    var k, AA, BB, CC, DD, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    string = md5_Utf8Encode(string);
    x = md5_ConvertToWordArray(string);
    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        AA = a; BB = b; CC = c; DD = d;
        a = md5_FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
        d = md5_FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = md5_FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
        b = md5_FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = md5_FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
        d = md5_FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = md5_FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
        b = md5_FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = md5_FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
        d = md5_FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = md5_FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
        b = md5_FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = md5_FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
        d = md5_FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
        c = md5_FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
        b = md5_FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
        a = md5_GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
        d = md5_GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
        c = md5_GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
        b = md5_GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = md5_GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
        d = md5_GG(d, a, b, c, x[k + 10], S22, 0x2441453);
        c = md5_GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
        b = md5_GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = md5_GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
        d = md5_GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
        c = md5_GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
        b = md5_GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = md5_GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
        d = md5_GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
        c = md5_GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
        b = md5_GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
        a = md5_HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
        d = md5_HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
        c = md5_HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
        b = md5_HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = md5_HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
        d = md5_HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
        c = md5_HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
        b = md5_HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = md5_HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
        d = md5_HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
        c = md5_HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
        b = md5_HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
        a = md5_HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
        d = md5_HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
        c = md5_HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
        b = md5_HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
        a = md5_II(a, b, c, d, x[k + 0], S41, 0xF4292244);
        d = md5_II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
        c = md5_II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
        b = md5_II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = md5_II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
        d = md5_II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
        c = md5_II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
        b = md5_II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = md5_II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
        d = md5_II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
        c = md5_II(c, d, a, b, x[k + 6], S43, 0xA3014314);
        b = md5_II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = md5_II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
        d = md5_II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
        c = md5_II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
        b = md5_II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
        a = md5_AddUnsigned(a, AA);
        b = md5_AddUnsigned(b, BB);
        c = md5_AddUnsigned(c, CC);
        d = md5_AddUnsigned(d, DD);
    }
    if(bit==32){
        return (md5_WordToHex(a) + md5_WordToHex(b) + md5_WordToHex(c) + md5_WordToHex(d)).toLowerCase();
    }
    return (md5_WordToHex(b) + md5_WordToHex(c)).toLowerCase();
}