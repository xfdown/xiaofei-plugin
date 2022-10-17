import plugin from '../../../lib/plugins/plugin.js'
import GsCfg from '../../genshin/model/gsCfg.js'
import lodash from 'lodash'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import cfg from '../../../lib/config/config.js'
import { Version, Plugin_Path} from '.././components/index.js'
import moment from 'moment'
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
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?用户ck统计(uid)?$',
					/** 执行方法 */
					fnc: 'query_user_statistics'
				}
			]
		});
	}
	
	async query_user_statistics(){
		let e = this.e;
		let {uids, noteCount, botCount} = await this.get_all();
		let set = GsCfg.getConfig('mys', 'set');
		let showAll = false;
		if (!e.isGroup && /uid/.test(e.msg) && e.isMaster) {
			showAll = true;
		}
		let uidCount = 0,
		disable = 0,
		available = 0,
		queryCount = 0,
		canQuery = 0;
		lodash.forEach(uids, (uid) => {
			let count = uid.count;
			uid.process = Math.min((count / 27) * 100, 100).toFixed(2);
			uid.type = parseInt(uid.process / 25);
			canQuery += Math.max(0, 27 - uid.count);
			if (!showAll) {
				uid.uid = hideUid(uid.uid);
			}
			uidCount++;
			if (uid.count > 27) {
				disable++;
			} else {
				available++;
				queryCount += uid.count;
			}
		});
		
		let data = {
			plugin_path: Plugin_Path,
			uids,
			uidCount,
			queryCount,
			available,
			disable,
			canQuery,
			noteCount,
			botCount,
			useNoteCookie: set.allowUseCookie == 1 ? true : false,
			showAll,
			yunzai_ver: `v${cfg.package.version}`,
			xiaofei_ver: Version.ver
		};
		
		let img = await puppeteer.screenshot("user-stat", {
			tplFile: `${Plugin_Path}/resources/html/user-stat/index.html`,
			...data
		});
		await e.reply(img);
		return true;
	}
	
	async get_all(){
		let res = await GsCfg.getBingCk();
		let bingCkUid = res.ck
		
		let pubCk = GsCfg.getConfig('mys', 'pubCk') || [];
		let pub_list = [];
		for (let v of pubCk) {
			let [ltuid = ''] = v.match(/ltuid=(\w{0,9})/g)
			if (!ltuid) continue
			ltuid = String(lodash.trim(ltuid, 'ltuid='))
			if (isNaN(ltuid)) continue
			pub_list.push(ltuid);
		}
		
		let bindck_list = bingCkUid;
		
		let ck_info = {};
		let bindck_use_count = 0;
		let bindck_count = 0;

		for(let uid in bindck_list){
			let ltuid = bindck_list[uid].ltuid;
			let count = await redis.get(`${key.ckNum}${ltuid}`);
			count = Number(count);
			
			if(ck_info[ltuid]){
				ck_info[ltuid] = {
					count: count,
					ck_count: ck_info[ltuid].ck_count + 1
				};
			}else{
				ck_info[ltuid] = {
					count: count,
					ck_count: 1
				};
			}
			bindck_use_count += count;
			//bindck_count++;
		}
		
		bindck_count = Object.keys(ck_info).length;
		
		let pub_count = 0;
		let pub_use_count = 0;
		let pub_ck_info = {};
		
		for(let ltuid of pub_list){
			let count;
			let ck_count = 0;
			if(ck_info[ltuid]){
				count = ck_info[ltuid].count;
				ck_count = ck_info[ltuid].ck_count + 1;
			}else{
				count = await redis.get(`${key.ckNum}${ltuid}`);
				count = Number(count);
				ck_count = 1;
			}
			pub_ck_info[ltuid] = {
				count: count,
				ck_count: ck_count
			};
			pub_use_count += count;
		}
		pub_count = Object.keys(pub_ck_info).length;
		
		let uids = [], noteCount = bindck_count, botCount = pub_count;
		Object.assign(ck_info,pub_ck_info);
		
		for(let ltuid in ck_info){
			let info = ck_info[ltuid];
			uids.push({
				uid: ltuid,
				...info
			});
		}
		noteCount += botCount;
		return {uids, noteCount, botCount};
	}
	
	getEnd () {
		let end = moment().endOf('day').format('X')
		return end - moment().format('X')
	}
}

function hideUid(uid) {
  let str = "" + uid,
    ret = [];
  for (let idx = 0; idx < 10; idx++) {
    ret.push(idx > 1 && idx < 5 ? "*" : str[idx]);
  }
  return ret.join("");
}