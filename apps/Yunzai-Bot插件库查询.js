import fetch from "node-fetch";
import { segment } from "oicq";

const plugins_index_url = 'https://gitee.com/yhArcadia/Yunzai-Bot-plugins-index';

export class xiaofei_plugins_index extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_Yunzai-Bot插件库查询',
			/** 功能描述 */
			dsc: '实时从【https://gitee.com/yhArcadia/Yunzai-Bot-plugins-index】获取插件索引列表',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?(插件库|插件索引)$',
					/** 执行方法 */
					fnc: 'plugins_index'
				}
				
			]
		});
	}
	
	async plugins_index(){
		let plugin_list = await get_plugins_index();
		
		let json = {"app":"com.tencent.channel.robot","view":"albumAddPic","ver":"0.0.0.1","desc":"","prompt":"Yunzai-Bot插件库","meta":{"detail":{"list":[]}},"config":{"autoSize":1,"type":"normal","showSender":0}};
		
		let list = json.meta.detail.list;
		
		list.push({desc: 'Yunzai-Bot:'});
		list.push({
			desc: '[github]Yunzai-Bot v3 @Le-niao',
			link: 'https://github.com/Le-niao/Yunzai-Bot'
		});
		list.push({ 
			desc: '[gitee]Yunzai-Bot v3 @Le-niao',
			link: 'https://gitee.com/Le-niao/Yunzai-Bot'
		});
			
		
		for(let plugin_index of plugin_list){
			list.push({desc: plugin_index.title+':'});
			for(let val of plugin_index.data){
				list.push({
					desc: val.tag + val.name.trim() +' '+ val.author.trim(),
					link: val.link
				});
			}
		}
		
		let MsgList = [{
			message: segment.json(json),
			nickname: Bot.nickname,
			user_id: Bot.uin
		},{
			message: plugins_index_url,
			nickname: Bot.nickname,
			user_id: Bot.uin
		}];
			
		let forwardMsg = await Bot.makeForwardMsg(MsgList);
		forwardMsg.data = forwardMsg.data
		.replace('<?xml version="1.0" encoding="utf-8"?>','<?xml version="1.0" encoding="utf-8" ?>')
		.replace(/\n/g, '')
		.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
		.replace('转发的', '不可转发的')
		.replace(/___+/, '<title color="#777777" size="26">请点击查看插件库</title>');
		await this.e.reply(forwardMsg);
	}
}

async function get_plugins_index(){
	let response = await fetch(`${plugins_index_url}/raw/main/README.md`);
	let res = await response.text();
	
	let reg = /\#\#(.*索引)/mg;
	
	let list = [{
		data: res
	}];
	
	let exec;
	
	while(exec = reg.exec(res)){
		let arr = list[list.length-1].data.split(exec[0]);
		list[list.length-1].data = arr[0];
		list[list.length] = {
			title: exec[1].trim(),
			data: arr[1]
		};
	}
	list.shift();
	
	for(let val of list){
		let data = [];
		let plugin_reg = /\[.*\]\(.*\)*?\|*?\[.*\].*/mg;
		while(exec = plugin_reg.exec(val.data)){
			let arr = exec[0]
			.replace(/ \|/g,'|')
			.replace(/\| /g,'|')
			.split('|');
			if(arr.length > 1){
				let reg = /(\[(.*)\!\[|\[(.*)\]).*?\((.*?)\)/.exec(arr[0]);
				let author_reg = /\[(.*?)\]/g;
				let authors = [];
				while(exec = author_reg.exec(arr[1])){
					authors.push(exec[1]);
				}
				data.push({
					name: reg[2] || reg[3],
					link: reg[4],
					author: authors.join(' '),
					tag: (arr[2].includes('✔') ? '[v2]' : '') + (arr[3].includes('✔') ? '[v3]' : ''),
				})
			}
		}
		val.data = data;
	}
	return list;
}