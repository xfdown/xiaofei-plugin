import plugin from '../../../lib/plugins/plugin.js'
import cfg from '../../../lib/config/config.js'
import { segment } from "oicq";
import fetch from 'node-fetch'

export class xiaofei_replace extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_代发言',
			/** 功能描述 */
			dsc: '代替指定QQ发言。',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 10
		});
	}
	
	/** 接受到消息都会执行一次 */
	async accept () {
		if (!this.e.msg || !this.e.isMaster){
			return;
		}
		
		let e = this.e;
		let message = [];
		
		if (e.message) {
			for (let val of e.message) {
				if(val.type == 'at'){
					continue;
				}
				message.push(val);
			}
		}
		
		let reg = /^#?代(.*)$/.exec(e.msg);
		if(reg){
			let msg = reg[1];
			let at = e.at;
			if(!at){
				reg = /^#?代(\d+)(.*)$/.exec(e.msg);
				if(reg){
					at = reg[1];
					msg = reg[2];
				}else{
					return;
				}
			}
			at = Number(at);
			delete e.at;
			delete e.uid;
			e.message = message;
			e.user_id = at;
			e.from_id = at;
			e.sender.user_id = at;

			e.msg = msg;
			e.raw_message = msg;
			e.original_msg = msg;
			return;
		}
	}
	
}

