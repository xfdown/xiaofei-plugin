import plugin from '../../../lib/plugins/plugin.js'
import lodash from 'lodash'
import fetch from 'node-fetch'
import User from '../../genshin/model/user.js'
import gsCfg from '../../genshin/model/gsCfg.js'

export class xiaofei_ys_GetGachaUrl extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_获取抽卡链接',
			/** 功能描述 */
			dsc: '',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?获取抽卡(记录)?(链接|连接)(群聊)?$',
					/** 执行方法 */
					fnc: 'GetGachaUrl',
				},
			]
		});
	}
	
	async GetGachaUrl(){
		if(this.e.isGroup && !this.e.msg.includes('群')){
			await this.e.reply('建议私聊发送该指令，如需在群内查看，请发送【#获取抽卡链接群聊】！');
			return true;
		}
		
		let result = await get_gacha_authkeys(this.e);
		if(result.code != 1){
			await this.e.reply(result.msg);
			return true;
		}
		let authkeys = result.data;
		
		let info = {
			nickname: Bot.nickname,
			user_id: Bot.uin
		};
		let MsgList = [];
		
		for(let val of authkeys){
			let GachaUrl = `https://webstatic.mihoyo.com/hk4e/event/e20190909gacha-v2/index.html?win_mode=fullscreen&authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&gacha_id=fecafa7b6560db5f3182222395d88aaa6aaac1bc&timestamp=${parseInt(new Date().getTime()/1000)}&lang=zh-cn&device_type=mobile&plat_type=ios&region=${val.region}&authkey=${encodeURIComponent(val.authkey)}&game_biz=hk4e_cn#/log`;
			MsgList.push({
				...info,
				message: `uid：${val.uid}\r\n抽卡记录链接：${GachaUrl}`
			});
		}
		
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await this.e.reply(forwardMsg);
		return true;
	}
}

async function get_gacha_authkeys(e){
	try{
		var MihoYoApi = await import('../../xiaoyao-cvs-plugin/model/mys/mihoyo-api.js'); MihoYoApi = MihoYoApi.default;
		var utils = await import('../../xiaoyao-cvs-plugin/model/mys/utils.js');
		var xy_gsCfg = await import('../../xiaoyao-cvs-plugin/model/gsCfg.js'); xy_gsCfg = xy_gsCfg.default;
		var xy_User = await import('../../xiaoyao-cvs-plugin/model/user.js'); xy_User = xy_User.default;
	}catch(err){
		return {code: -1,msg: '加载xiaoyao-cvs-plugin失败，请确定已安装xiaoyao-cvs-plugin！'};
	}
	
	let stoken = await xy_gsCfg.getUserStoken(e.user_id);
	if (Object.keys(stoken).length==0) {
		return {code: -1,msg: '请先绑定stoken\n发送【stoken帮助】查看配置教程'};
	}
	let authkeys = [];
	let authkeyrow = {};
	for(let item of  Object.keys(stoken)){
		let uid = stoken[item].uid;
		e.region = getServer(uid);
		let user = new xy_User(e);
		await user.cookie(e)
		let miHoYoApi = new MihoYoApi(e);
		authkeyrow = await miHoYoApi.authkey(e);
		if (authkeyrow?.data) {
			let authkey = authkeyrow.data["authkey"]
			authkeys.push({uid: uid, region: e.region, authkey: authkey})
		}
	}
	if(authkeys.length < 1){
		return {code: -1,msg: "authkey获取失败：" + authkeyrow.message};
	}
	return {code: 1,data: authkeys};
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