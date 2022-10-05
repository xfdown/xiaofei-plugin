import plugin from '../../../lib/plugins/plugin.js'
import lodash from 'lodash'
import fetch from 'node-fetch'
import fs from 'node:fs'
import User from '../../genshin/model/user.js'
import gsCfg from '../../genshin/model/gsCfg.js'
import {Plugin_Path} from '../components/index.js'

export class xiaofei_ys_QueryRegTime extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_原神注册时间查询',
			/** 功能描述 */
			dsc: '从原神绘忆星辰活动获取游戏注册时间。',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?(刷新)?(我的|原神)?注册时间$',
					/** 执行方法 */
					fnc: 'QueryRegTime',
				},
			]
		});
	}
	
	async QueryRegTime(){
		let cookies = null;
		let result = await query_mysck(this.e);
		if(result?.code == 1){
			cookies = result.data?.ck;
		}else if(result?.code == -2){
			this.e.reply(result.msg);
			return true;
		}else{
			this.e.reply('cookie_token已失效，请重新抓取ck！\r\n发送【ck帮助】查看配置教程\r\n'+result.msg);
			return true;
		}
		
		let ck = gsCfg.getBingCkSingle(this.e.user_id)
		let uids = lodash.map(ck, 'uid')
		
		let list = [];
		for(var i in uids){
			list.push(await query_reg_time(this.e,cookies,uids[i]));
		}
		
		this.reply(`---原神注册时间---\r\n${list.join('\r\n----------------\r\n')}\r\n提示：如需更新最新数据，请发送【#刷新原神注册时间】`);

		return true;
	}
}


async function query_reg_time(e,mys_cookies,uid){
	let result = await get_game_data(e, mys_cookies, uid);
	if(result?.code == 1 && result.info_data && result.game_data){
		
		let level = result.info_data.level;
		let nickname = result.info_data.nickname;
		let region_name = result.info_data.region_name;
		
		let data = result.game_data.data?.data;
		data = data ? JSON.parse(data) : {};
		let reg_time = data['1'];
		
		if(reg_time > 0){
			reg_time = new Date(reg_time*1000).toLocaleString();
		}else{
			reg_time = '查询失败！';
		}
		
		let query_time = new Date(result.query_time).toLocaleString();
		return `uid：${nickname}(${uid})\r\n服务器：${region_name}\r\n冒险等级：${level}\r\n注册时间：${reg_time}\r\n查询时间：${query_time}`;
	}
	return `uid：${uid}\r\n注册时间：查询失败，cookie_token可能已过期！`;
}

async function get_game_data(e,mys_cookies,uid){
	let game_data = null;
	let temp_data = null;
	let temp_file = `${Plugin_Path}/data/ys_RegTime/${e.user_id}.json`;
	try{
		if(fs.existsSync(temp_file)){
			temp_data = JSON.parse(fs.readFileSync(temp_file, 'utf8'));
		}
	}catch(err){}
	
	if(temp_data && temp_data[uid] && temp_data[uid].game_data && temp_data[uid].info_data && !e.msg.includes('刷新')){
		game_data = temp_data[uid];
	}
	
	if(!game_data || (new Date().getTime() - game_data.query_time) > (1000 * 60 * 60 * 6) || e.msg.includes('刷新')){
		let result = await update_game_data(mys_cookies, uid);
		if(result.code == 1 && result.data){
			try{
				let save_data = temp_data ? temp_data : {};
				save_data[uid] = result.data;
				fs.writeFileSync(temp_file, JSON.stringify(save_data), 'utf8');
			}catch(err){}
			game_data = result.data;
		}
	}
	
	if(game_data){
		return {code: 1, ...game_data};
	}

	return {code: -1};
}

async function update_game_data(mys_cookies,uid){
	let result = await hk4e_cn_login(mys_cookies,uid);
	if(result.code == 1){
		let info_data = result.data.data?.data; info_data = info_data ? info_data : null;
		let options = {
			method: 'GET',
			headers: {
				'Cookie': result.data.cookies.join('; ')
			}
		};
		let url = `https://hk4e-api.mihoyo.com/event/e20220928anniversary/game_data?badge_uid=${uid}&badge_region=${info_data.region}&lang=zh-cn&game_biz=${info_data.game_biz}`;
		let response = await fetch(url,options);
		try{
			let res = await response.json();
			let data = res.data?.data;
			if(info_data && data){
				return {code: 1, 
					data: {game_data: res, info_data: info_data, query_time: new Date().getTime()}
				};
			}
		}catch(err){}
	}
	return {code: -1};
}


async function hk4e_cn_login(mys_cookies,uid){
	let body = {"game_biz":"hk4e_cn","lang":"zh-cn","region":"cn_gf01","uid":""};
	body['region'] = getServer(uid);
	body['uid'] = uid;
	
	let options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': mys_cookies
		},
		body: JSON.stringify(body)
	};
	
	let url = `https://api-takumi.mihoyo.com/common/badge/v1/login/account`;
	let response = await fetch(url,options);
	
	let cookies = [];
	let code = -1;
	let result = null;
	try{
		let headers = response.headers;
		let SetCookie = headers.getAll('set-cookie');
		
		for(let index in SetCookie){
			let cookie = SetCookie[index];
			let reg = /(.*?);/.exec(cookie);
			if(reg && reg.length > 1){
				cookie = reg[1];
				let arr = cookie.split('=');
				if(arr.length > 1 && arr[1] != ''){
					if(arr[0] == 'e_hk4e_token'){
						code = 1;
					}
					cookies.push(cookie);
				}
			}
		}
		if(cookies.length > 0){
			let res = await response.json();
			result = {cookies: cookies,data: res};
		}
	}catch(err){}
	return {code: code,data: result};
}

async function query_mysck(e){
	let ck = gsCfg.getBingCkSingle(e.user_id);
    if (lodash.isEmpty(ck)) {
      return {code: -2,msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程'};
    }
	
    ck = lodash.find(ck, (v) => { return v.isMain })
    if (!lodash.isEmpty(ck)) {
      return {code: 1,msg: '获取成功！',data: ck};
    }
	return {code: -1,msg: '获取Cookie失败！'};;
}

function getServer (uid) {
    switch (String(uid)[0]) {
      case '1':
      case '2':
        return 'cn_gf01' // 官服
      case '5':
        return 'cn_qd01' // B服
      case '6':
        return 'os_usa' // 美服
      case '7':
        return 'os_euro' // 欧服
      case '8':
        return 'os_asia' // 亚服
      case '9':
        return 'os_cht' // 港澳台服
    }
    return 'cn_gf01'
}


