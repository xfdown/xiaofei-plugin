import plugin from '../../../lib/plugins/plugin.js'
import { update } from '../.././other/update.js'

export class xiaofei_update extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '更新插件',
			/** 功能描述 */
			dsc: '调用Yunzai自带更新模块进行插件更新',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 5000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '#?小飞(插件)?(强制)?更新',
					/** 执行方法 */
					fnc: 'update_plugin'
				},
			]
		});
	}
	
	async update_plugin(){
		let Update_Plugin = new update();
		Update_Plugin.e = this.e;
		Update_Plugin.reply = this.reply;
		Update_Plugin.isUp = true;
		
		let plu = 'xiaofei-plugin';
		if(Update_Plugin.getPlugin(plu)){
			await Update_Plugin.runUpdate(plu);
		}
		return true;
	}
}