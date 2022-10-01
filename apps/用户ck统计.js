import plugin from '../../../lib/plugins/plugin.js'
import GsCfg from '../../genshin/model/gsCfg.js'
import lodash from 'lodash'
/** redis key */
const keyPre = 'Yz:genshin:mys:';
const key = {
	/** ck使用次数统计 */
	count: `${keyPre}ck:count`,
	/** ck使用详情 */
	detail: `${keyPre}ck:detail`,
	/** 单个ck使用次数 */
	ckNum: `${keyPre}ckNum:`,
	/** 已失效的ck使用详情 */
	delDetail: `${keyPre}ck:delDetail`,
	/** qq-uid */
	qqUid: `${keyPre}qq-uid:`
};

export class xiaofei_userck_statistics extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_用户ck统计',
			/** 功能描述 */
			dsc: '',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 999,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?用户ck统计$',
					/** 执行方法 */
					fnc: 'query_user_statistics'
				}
			]
		});
	}
	
	
		
	async query_user_statistics(){
		let msg = [];
		
		let res = await GsCfg.getBingCk();
		let bingCkUid = res.ck
		let bingCkQQ = res.ckQQ
		let bingCkLtuid = lodash.keyBy(bingCkUid, 'ltuid')
		
		let pubCk = GsCfg.getConfig('mys', 'pubCk') || [];
		let pub_list = [];
		for (let v of pubCk) {
			let [ltuid = ''] = v.match(/ltuid=(\w{0,9})/g)
			if (!ltuid) continue
			ltuid = String(lodash.trim(ltuid, 'ltuid='))
			if (isNaN(ltuid)) continue
			pub_list.push(ltuid);
		}
		
		let bindck_list = bingCkLtuid;
		//let pub_list = await redis.zRangeByScore(key.count, 0, 999);
		//let Transfinite_list = await redis.zRangeByScore(key.count,99,99);
		
		let ck_info = {};
		let bindck_use_count = 0;
		let bindck_count = 0;
		
		for(let uid in bindck_list){
			let count;
			if(false){
				count = -1;
			}else{
				count = await redis.get(`${key.ckNum}${uid}`)
			}
			count = Number(count);
			ck_info[uid] = {
				count: count
			};
			bindck_use_count += count == -1 ? 27 : count;
			bindck_count++;
		}
		
		let pub_count = 0;
		let pub_use_count = 0;
		let pub_ck_info = {};
		
		for(let uid of pub_list){
			let count;
			if(ck_info[uid]){
				count = ck_info[uid].count;
			}else{
				if(false){
					count = -1;
				}else{
					count = await redis.get(`${key.ckNum}${uid}`)
				}
				count = Number(count);
			}
			pub_ck_info[uid] = {
				count: count
			};
			pub_use_count += count == -1 ? 27 : count;
		}
		pub_count = Object.keys(pub_ck_info).length;
		
		let set = GsCfg.getConfig('mys', 'set')
		
		msg.push('---用户ck统计---');
		msg.push(`绑定ck数：${bindck_count}`);
		msg.push(`绑定ck使用次数：${bindck_use_count}`);
		msg.push(`公共ck数：${pub_count}`);
		msg.push(`公共ck使用次数：${pub_use_count}`);
		if (set.allowUseCookie == 1) {
			msg.push(`已开启公共查询使用用户ck`);
		}else{
			msg.push(`未开启公共查询使用用户ck`);
		}
		
		//await this.e.reply(msg.join('\r\n'));
		//return true;
		
		let info = {
			nickname: Bot.nickname,
			user_id: Bot.uin
		};
		
		let MsgList = [{
			...info,
			message: String(msg.join('\r\n')),
		}];
		
		try{
			//Object.assign(ck_info,pub_ck_info);
			msg = [];
			msg.push('---用户ck统计列表---');
			for(let uid in ck_info){
				msg.push('['+uid+']使用次数：'+ck_info[uid].count)
			}
			msg.push('---公共ck统计列表---');
			for(let uid in pub_ck_info){
				msg.push('['+uid+']使用次数：'+pub_ck_info[uid].count)
			}
			
			MsgList.push({
				...info,
				message: String(msg.join('\r\n')),
			});
		}catch(err){
		}
		
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		await this.e.reply(forwardMsg);
		return true;
	}
}