import plugin from '../../../lib/plugins/plugin.js'
import loader from '../../../lib/plugins/loader.js'

export class xiaofei_replace extends plugin {
	constructor() {
		super({
			/** 功能名称 */
			name: '小飞插件_代发言',
			/** 功能描述 */
			dsc: '代替指定QQ发言。',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 10,
			rule: [{
				/** 命令正则匹配 */
				reg: '^#?代(.*)',
				/** 执行方法 */
				fnc: 'replace'
			}]
		});
	}

	async replace() {
		if (!this.e.msg || !this.e.isMaster) {
			return;
		}
		let e = this.e;
		let message = [];
		let reg = /^#?代(.*)$/.exec(e.msg);
		if (reg) {
			let msg = reg[1];
			let at = e.at;
			if (!at) {
				reg = /^#?代(\d+)(.*)$/.exec(e.msg);
				if (reg) {
					at = reg[1];
					msg = reg[2];
				} else {
					return;
				}
			}
			at = Number(at);
			if (e.replyNew) e.reply = e.replyNew
			delete e.at;
			delete e.uid;
			delete e.msg;

			if (e.message) {
				let at_index = 0;
				for (let val of e.message) {
					if (val.type == 'at' && at_index == 0) {
						at_index++;
						continue;
					}
					let reg = /^#?代(.*)$/.exec(val.text);
					if (reg) val.text = reg[1];
					message.push(val);
				}
			}

			e.message = message;
			e.user_id = at;
			e.from_id = at;

			let nickname = e.group?.pickMember(at)?.nickname || Bot.pickFriend(at).nickname;
			nickname = nickname || at;
			e.sender.card = nickname;
			e.sender.nickname = nickname;
			e.sender.user_id = at;
			msg = msg?.trim();
			e.raw_message = msg;
			e.original_msg = msg;
			loader.deal(e);
			return true;
		}
	}

}