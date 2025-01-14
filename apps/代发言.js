import plugin from "../../../lib/plugins/plugin.js";
import loader from "../../../lib/plugins/loader.js";

export class xiaofei_replace extends plugin {
	constructor() {
		super({
			/** 功能名称 */
			name: "小飞插件_代发言",
			/** 功能描述 */
			dsc: "代替指定QQ发言。",
			/** https://oicqjs.github.io/oicq/#events */
			event: "message",
			/** 优先级，数字越小等级越高 */
			priority: 10,
			rule: [
				{
					/** 命令正则匹配 */
					reg: "^#?代(.*)",
					/** 执行方法 */
					fnc: "replace",
				},
			],
		});
	}

	async replace() {
		const bot = this.e.bot || Bot;
		if (!this.e.msg || !this.e.isMaster || !bot) {
			return;
		}
		let e = this.e;
		let message = [];
		let reg = /代(.*)$/.exec(e.msg);
		if (reg) {
			let msg = reg[1]?.trim();
			let at = e.at;
			if (!at) {
				reg = /代(\d+)(.*)$/.exec(e.msg);
				if (reg) {
					at = reg[1];
					msg = reg[2]?.trim();
				} else {
					return;
				}
			}
			at = Number(at);
			if (e.replyNew) e.reply = e.replyNew;
			if (e.message) {
				let at_index = 0;
				for (let val of e.message) {
					if (val.type == "at" && at_index == 0) {
						at_index++;
						continue;
					}
					let reg = /代(\d+)?(.*)$/.exec(val.text);
					if (reg) val.text = reg[2]?.trim();
					message.push(val);
				}
			}
			message.unshift(segment.at(bot.uin));
			msg = msg?.trim();
			const new_e = {
				atall: e.atall,
				atme: e.atme,
				block: e.block,
				font: e.font,
				from_id: at,
				group: e.group,
				group_id: e.group_id,
				group_name: e.group_name,
				isGroup: e.isGroup,
				isMaster: false,
				member: e.group.pickMember(at),
				message: message,
				message_id: e.message_id,
				message_type: e.message_type,
				msg_id: e.msg_id,
				nt: e.nt,
				original_msg: msg,
				post_type: e.post_type,
				rand: e.rand,
				raw_message: msg,
				recall: e.reacall,
				reply: e.reply,
				self_id: e.self_id,
				sender: {},
				seq: e.seq,
				sub_type: e.sub_type,
				time: e.time,
				user_id: at
			};
			new_e.sender = new_e.member?.info || {
				card: at,
				nickname: at,
				user_id: at,
			};
			try {
				bot.em("message", { ...new_e });
			} catch {
				loader.deal({ ...new_e });
			}
			return true;
		}
	}
}
