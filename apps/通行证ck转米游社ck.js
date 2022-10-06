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
		if (this.e.msg.includes('login_ticket=') && !this.e.msg.includes('cookie_token=')) {
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
			
			if(!param.login_ticket){
				let arr = [];
				!param.login_ticket && arr.push('login_ticket参数不存在!');
				this.e.reply('[通行证]Cookie参数不完整！'+arr.join("\r\n"), false);
				//this.e.msg = '';
				return true;
			}
			let result = await get_server_api(param);
			if(result.api_index < 0){
				this.e.reply('[通行证]Cookie已失效，请重新获取！', false);
				//this.e.msg = '';
				return true;
			}
			
			param = {
				...param,
				...result
			};
			param.login_uid = String(param.account_id);
			
			result = await get_stoken(param);
			if(result?.code != 1){
				this.e.reply(`[${param.server_name}通行证]获取stoken失败，请重试！`, false);
				//this.e.msg = '';
				return true;
			}
			let stoken_data = result.data;
			let cookies = stoken_data.cookies;
			
			try{
				let map = getCookieMap(cookies);
				let game_biz = param.api_index == 0 ? 'hk4e_cn' : 'hk4e_global';
				let url = `${param.api}/auth/api/getCookieAccountInfoBySToken?game_biz=${game_biz}`;
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
					await this.e.reply(`[${param.server_name}通行证]获取cookie_token成功，下面开始执行官方绑定过程。。。`, false);
					//this.e.ck = arr.join('; ');
					//this.e.msg = '#绑定cookie';
					this.e.msg = arr.join('; ');
					this.e.raw_message = this.e.msg;
					return true;
				}
			}catch(err){}
			
			this.e.reply(`[${param.server_name}通行证]获取cookie_token失败，请重试！`, false);
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
		var response = await fetch(`${param.api}/auth/api/getMultiTokenByLoginTicket?login_ticket=${param.login_ticket}&token_types=3&uid=${param.login_uid}`);
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

async function get_server_api(param){
	let apis = ['https://api-takumi.mihoyo.com', 'https://api-os-takumi.mihoyo.com'];
	let web_apis = ['https://webapi.account.mihoyo.com', 'https://webapi-os.account.hoyoverse.com'];
	let api_index = -1;
	let account_id = 0;
	let server_name = '';
	try{
		let options = {
			method: 'GET',
			headers: {
				'Cookie': `login_ticket=${param.login_ticket};`
			}
		};
		for(let index in web_apis){
			let url = `${web_apis[index]}/Api/login_by_cookie?t=${new Date().getTime()}`;
			let response = await fetch(url,options);
			let res = await response.json();
			if(res?.code == 200 && res.data?.status == 1){
				api_index = index;
				account_id = res.data.account_info?.account_id;
				server_name = index == 0 ? '米哈游' : 'HoYoverse';
				break;
			}
		}
	}catch(err){}
	return {
		api_index: api_index,
		api: api_index == -1 ? '' : apis[api_index],
		web_api: api_index == -1 ? '' : web_apis[api_index],
		account_id: account_id,
		server_name: server_name
	};
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