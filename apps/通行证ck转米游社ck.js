import plugin from '../../../lib/plugins/plugin.js'
import { segment } from "oicq";
import fetch from 'node-fetch'
import fs from 'node:fs'
import {Path, Plugin_Path} from '../components/index.js'

export class xiaofei_mysck extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_通行证ck转米游社ck',
			/** 功能描述 */
			dsc: '使用米哈游通行证ck登录米游社并自动绑定。',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: -1//防止禁用私聊功能后无法绑定通行证ck
		});
	}
	
	/** 接受到消息都会执行一次 */
	async accept () {
		if (!this.e.msg){
			return false;
		}
		await this.mysck();
	}
	
	async mysck(){
		if (this.e.msg.includes('login_ticket=') && this.e.msg.includes('login_uid=')) {
			if (this.e.isGroup) {
				this.e.reply('请私聊发送cookie', false, { at: true });
				this.e.msg = '';
				return true;
			}
			let ck_map = getCookieMap(this.e.msg);
			
			let param = {
				login_ticket: ck_map?.get('login_ticket'),
				login_uid: ck_map?.get('login_uid')
			};
			
			if(!param.login_ticket || !param.login_uid){
				let arr = [];
				!login_ticket && arr.push('login_ticket参数不存在!');
				!login_uid && arr.push('login_uid参数不存在!');
				this.e.reply('[米哈游通行证]Cookie参数不完整！'+arr.join("\r\n"), false);
				//this.e.msg = '';
				return true;
			}
			
			let result = await getUserGameRoles(param);
			if(result?.code != 1){
				this.e.reply('[米哈游通行证]Cookie已失效，请重新获取！', false);
				//this.e.msg = '';
				return true;
			}
			
			let infos = [];
			for(let index in result.data){
				let value = result.data[index];
				if(value.game_biz == 'hk4e_cn'){
					infos.push(value);
				}
			}
			
			if(infos.length < 1){
				this.e.reply('[米哈游通行证]获取账号游戏信息失败！');
				//this.e.msg = '';
				return true;
			}
			
			result = await get_stoken(param);
			if(result?.code != 1){
				this.e.reply('[米哈游通行证]获取stoken失败，请重试！', false);
				//this.e.msg = '';
				return true;
			}
			let stoken_data = result.data;
			
			try{
				
				try{
					let file = `${Path}/plugins/xiaoyao-cvs-plugin/data/yaml/${this.e.user_id}.yaml`;
					if(fs.existsSync(file)){
						fs.unlinkSync(file);
					}
				}catch(err){}
				
				let xy_gsCfg = await import('../../xiaoyao-cvs-plugin/model/gsCfg.js'); xy_gsCfg = xy_gsCfg.default;
				let datalist = {};
				for(let info of infos){
					datalist[info.game_uid] = {
						stuid: stoken_data.stuid,
						stoken: stoken_data.stoken,
						ltoken: stoken_data.ltoken,
						uid: info.game_uid,
						userId: this.e.user_id,
						is_sign: true
					};
				}
				xy_gsCfg.saveBingStoken(this.e.user_id, datalist);
				this.e.reply('[米哈游通行证]已保存stoken！', false);
			}catch(err){}
			
			let cookies = stoken_data.cookies;
			
			try{
				let map = getCookieMap(cookies);
				let url = `https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken?game_biz=hk4e_cn`;
				url += `&stoken=${map.get("stoken")}&uid=${map.get("stuid")}`;
				let response = await fetch(url);
				let res = await response.json()
				
				if(res?.retcode == 0 && res?.data){
					let cookie_token = res["data"]["cookie_token"];
					let arr = [];
					arr.push(`ltoken=${map.get("ltoken")}`);
					arr.push(`ltuid=${map.get("stuid")}`);
					arr.push(`cookie_token=${cookie_token}`);
					arr.push(`account_id=${map.get("stuid")}`);
					arr.push(`login_ticket=${param.login_ticket}`);
					arr.push(`login_uid=${param.login_uid}`);
					console.log(arr.join('; '));
					await this.e.reply('[米哈游通行证]获取cookie_token成功，下面开始执行官方绑定过程。。。', false);
					//this.e.ck = arr.join('; ');
					//this.e.msg = '#绑定cookie';
					this.e.msg = arr.join('; ');
					this.e.raw_message = this.e.msg;
					return true;
				}
			}catch(err){}
			
			this.e.reply('[米哈游通行证]获取cookie_token失败，请重试！', false);
			//this.e.msg = '';
			return true;
		}
		return false;
	}
}



async function get_stoken(param){
	let result = {
		code: -1,
		msg: '',
		data: {}
	};
	
	try{
		var response = await fetch(`https://api-takumi.mihoyo.com/auth/api/getMultiTokenByLoginTicket?login_ticket=${param.login_ticket}&token_types=3&uid=${param.login_uid}`);
		var res = await response.json();
		if(res?.retcode == 0 && res?.data?.list){
			let list = res.data.list;
			let arr = [];
			for(let index in list){
				let value = list[index];
				result.data[value.name] = value.token;
				arr.push(`${value.name}=${value.token}`);
			}
			result.data['stuid'] = param.login_uid;
			arr.push(`stuid=${param.login_uid}`);
			result.data['cookies'] = arr.join('; ');
			result.code = 1;
		}
	}catch(err){}
	
	return result;
}

async function getUserGameRoles(param){
	let result = {
		code: -1,
		msg: '',
		data: {}
	};
	let action_ticket = null;
	
	let options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'Cookie': `login_uid=${param.login_uid}; login_ticket=${param.login_ticket}`
		},
		body: `action_type=game_role&t=${new Date().getTime()}`
	};
	
	
	
	try{
		let url = `https://webapi.account.mihoyo.com/Api/get_ticket_by_loginticket`;
		let response = await fetch(url,options);
		let res = await response.json();
		if(res?.code == 200){
			action_ticket = res.data.ticket;
		}
	}catch(err){
	}
	
	if(action_ticket == null){
		return result;
	}
	
	try{
		let url = `https://api-takumi.mihoyo.com/binding/api/getUserGameRoles?action_ticket=${action_ticket}&t=${new Date().getTime()}`;
		let response = await fetch(url);
		let res = await response.json();
		if(res?.retcode == 0 && res?.data){
			result.code = 1;
			result.data = res.data?.list;
		}
	}catch(err){}
	
	return result;
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