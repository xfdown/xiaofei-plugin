import plugin from '../../../lib/plugins/plugin.js'
import lodash from 'lodash'
import fetch from 'node-fetch'
import User from '../../genshin/model/user.js'
import gsCfg from '../../genshin/model/gsCfg.js'

export class xiaofei_ys_QueryRegTime extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_原神注册时间查询',
			/** 功能描述 */
			dsc: '从原神绘忆星辰活动获取游戏注册时间。获取cookie_token调用了逍遥插件！',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 5000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?(我的|原神)?注册时间$',
					/** 执行方法 */
					fnc: 'QueryRegTime',
				},
			]
		});
	}
	
	async QueryRegTime(){
		let cookies = null;
		let result = await query_mysck(this.e);
		if(result?.code == 1 && (await hk4e_cn_login(result.data?.ck,result.data?.uid)).code == 1){
			cookies = result.data?.ck;
		}else if(result?.code == -2){
			this.e.reply(result.msg);
			return true;
		}else{
			let result = await xiaoyao_query_mysck(this.e);
			if(result.code == -1){
				this.e.reply('cookie_token已失效，请重新抓取ck！\r\n发送【ck帮助】查看配置教程\r\n'+result.msg);
				return true;
			}
			cookies = result.cookies;
		}
		
		let ck = gsCfg.getBingCkSingle(this.e.user_id)
		let uids = lodash.map(ck, 'uid')
		
		let list = [];
		for(var i in uids){
			list.push(await query_reg_time(cookies,uids[i]));
		}
		
		this.reply(`---原神注册时间---\r\n${list.join('\r\n----------------\r\n')}`);

		return true;
	}
}


async function query_reg_time(mys_cookies,uid){
	let result = await hk4e_cn_login(mys_cookies,uid);
	if(result.code == 1){
		let data = result.data.data?.data;data = data ? data : {};
		let level = data.level;
		let nickname = data.nickname;
		let region_name = data.region_name;
		let options = {
			method: 'GET',
			headers: {
				'Cookie': result.data.cookies.join('; ')
			}
		};
		let url = `https://hk4e-api.mihoyo.com/event/e20220928anniversary/game_data?badge_uid=${uid}&badge_region=${data.region}&lang=zh-cn&game_biz=${data.game_biz}`;
		let response = await fetch(url,options);
		let reg_time = -1;
		try{
			let res = await response.json();
			let data = res.data?.data;
			data = data ? JSON.parse(data) : {};
			reg_time = data['1'];
		}catch(err){}
		
		if(reg_time > 0){
			reg_time = new Date(reg_time*1000).toLocaleString();
		}else{
			reg_time = '查询失败！';
		}
		
		return `uid：${nickname}(${uid})\r\n服务器：${region_name}\r\n冒险等级：${level}\r\n注册时间：${reg_time}`;
	}
	return `uid：${uid}\r\n注册时间：查询失败！`;
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

async function xiaoyao_query_mysck(e){
	try{
		var MihoYoApi = await import('../../xiaoyao-cvs-plugin/model/mys/mihoyo-api.js'); MihoYoApi = MihoYoApi.default;
		var utils = await import('../../xiaoyao-cvs-plugin/model/mys/utils.js');
		var xy_gsCfg = await import('../../xiaoyao-cvs-plugin/model/gsCfg.js'); xy_gsCfg = xy_gsCfg.default;
	}catch(err){
		return {code: -1,msg: '加载xiaoyao-cvs-plugin失败，请确定已安装xiaoyao-cvs-plugin！'};
	}
	
	let stoken = await xy_gsCfg.getUserStoken(e.user_id);
	if (Object.keys(stoken).length==0) {
		return {code: -1,msg: '请先绑定stoken\n发送【stoken帮助】查看配置教程'};
	}
	let miHoYoApi = new MihoYoApi(e);
	let cookies = '';

	for(let item of  Object.keys(stoken)){
		e.region = getServer(stoken[item].uid)
		miHoYoApi.cookies= `stuid=${stoken[item].stuid};stoken=${stoken[item].stoken};ltoken=${stoken[item].ltoken};`;
		let resObj = await miHoYoApi.updCookie();
		if (!resObj?.data) {
			return {code: -1,msg: '获取Cookies失败！'};
		}
		let sk = await utils.getCookieMap(miHoYoApi.cookies);
		let ck = resObj["data"]["cookie_token"];
		cookies = `ltoken=${sk.get("ltoken")};ltuid=${sk.get("stuid")};cookie_token=${ck}; account_id=${sk.get("stuid")};`;
	}
	return {code: 1,cookies: cookies};
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


