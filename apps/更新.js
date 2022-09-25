import plugin from '../../../lib/plugins/plugin.js'
import { update } from '../.././other/update.js'
import { Version } from '.././components/index.js'
export class xiaofei_update extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_更新',
			/** 功能描述 */
			dsc: '调用Yunzai自带更新模块进行插件更新',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 5000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?小飞(插件)?(强制)?更新$',
					/** 执行方法 */
					fnc: 'update_plugin',
					permission: 'master'
				},
				{
					/** 命令正则匹配 */
					reg: '^#?小飞(插件)?版本$',
					/** 执行方法 */
					fnc: 'plugin_version',
					permission: 'master'
				},
			]
		});
	}
	
	async update_plugin(){
		let Update_Plugin = new update();
		Update_Plugin.e = this.e;
		Update_Plugin.reply = this.reply;
		
		let plu = 'xiaofei-plugin';
		if(Update_Plugin.getPlugin(plu)){
			await Update_Plugin.runUpdate(plu);
			if(Update_Plugin.isUp){
				setTimeout(() => Update_Plugin.restart(), 2000)
			}
		}
		return true;
	}
	
	async plugin_version(){
		await this.reply('小飞插件当前版本：'+Version.ver);
		return true;
	}
}