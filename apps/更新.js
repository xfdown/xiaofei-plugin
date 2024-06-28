import { execSync } from 'child_process'
import { Version, Common, Plugin_Name } from '../components/index.js'
let update;
try{
	update = (await import('../../other/update.js'))?.update;
}catch{}

export class xiaofei_update extends plugin {
	constructor() {
		super({
			/** 功能名称 */
			name: '小飞插件_更新',
			/** 功能描述 */
			dsc: '调用Yunzai自带更新模块进行插件更新',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 2000,
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
				},
				{
					/** 命令正则匹配 */
					reg: '^#?小飞(插件)?更新日志$',
					/** 执行方法 */
					fnc: 'update_log',
				},
			]
		});
	}

	async update_plugin() {
		if(!update){
			this.e.msg = `#${this.e.msg.includes('强制') ? '强制' : ''}更新xiaofei-plugin`;
			return false;
		}
		let Update_Plugin = new update();
		Update_Plugin.e = this.e;
		Update_Plugin.reply = this.reply;

		if (Update_Plugin.getPlugin(Plugin_Name)) {
			if (this.e.msg.includes('强制')) {
				await execSync('git reset --hard', { cwd: `${process.cwd()}/plugins/${Plugin_Name}/` });
			}
			await Update_Plugin.runUpdate(Plugin_Name);
			if (Update_Plugin.isUp) {
				setTimeout(() => Update_Plugin.restart(), 2000)
			}
		}
		return true;
	}

	async plugin_version() {
		//await this.reply('小飞插件当前版本：'+Version.ver);
		return versionInfo(this.e);
	}

	async update_log() {
		if(!update){
			this.e.msg = `#更新日志xiaofei-plugin`;
			return false;
		}
		let Update_Plugin = new update();
		Update_Plugin.e = this.e;
		Update_Plugin.reply = this.reply;

		if (Update_Plugin.getPlugin(Plugin_Name)) {
			this.e.reply(await Update_Plugin.getLog(Plugin_Name));
		}
		return true;
	}
}

async function versionInfo(e) {
	return await Common.render('help/version-info', {
		currentVersion: Version.ver,
		changelogs: Version.logs,
		elem: 'cryo'
	}, { e, scale: 1.2 })
}