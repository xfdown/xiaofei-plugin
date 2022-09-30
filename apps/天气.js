import plugin from '../../../lib/plugins/plugin.js'
import { segment } from "oicq";
import fetch from "node-fetch";
import { core } from "oicq";
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

export class xiaofei_weather extends plugin {
	constructor () {
		super({
			/** 功能名称 */
			name: '小飞插件_天气',
			/** 功能描述 */
			dsc: '请求腾讯天气网站进行页面截图，目前支持以下命令：【#天气】',
			/** https://oicqjs.github.io/oicq/#events */
			event: 'message',
			/** 优先级，数字越小等级越高 */
			priority: 1000,
			rule: [
				{
					/** 命令正则匹配 */
					reg: '^#?(.*)天气$',
					/** 执行方法 */
					fnc: 'query_weather'
				}
			]
		});
	}
	
	async query_weather(){
		return await weather(this.e,this.e.msg.replace('#','').replace('天气',''));
	}
	
}

async function weather(e,search){
	if(typeof(search) == 'string') search = search.replace(/ /g,'');
	if(search == '' || search == '地区'){
		e.reply("格式：#地区天气\r\n例如：#北京天气",true);
		return true;
	}
	var area_id = -1,reg = null, province = '', city = '', district = '';
	reg = /((.*)省)?((.*)市)?((.*)区)?/.exec(search);
	if(reg[2]) province = reg[2]; search = search.replace(province+'省','');
	if(reg[4]) city = reg[4];
	if(reg[6]) district = reg[6];

	let url = `https://wis.qq.com/city/matching?source=xw&city=${encodeURI(search)}`;//地区名取area_id接口
	let response = await fetch(url); //获取area_id列表
	let res = null;
	try{
		res = await response.json();
	}catch(err){}
	if(res == null || res.status != 200 || !res.data?.internal || res.data?.internal.length < 1){
		e.reply('没有查询到该地区的天气！',true);
		return true;
	}
	
	let internal = res.data.internal;
	for(let key in internal){
		let arr = internal[key].split(', ');
		if(province && arr[0]){
			if(arr[0].indexOf(province) == -1){
				continue;
			}
		}
		
		if(city && arr[1]){
			if(arr[1].indexOf(city) == -1){
				continue;
			}
		}
		
		if(district && arr[2]){
			if(arr[2].indexOf(district) == -1){
				continue;
			}
		}
		
		if(arr[0]) province = arr[0];
		if(arr[1]) city = arr[1];
		if(arr[2]) district = arr[2];
		area_id = key;
		break;
	}
	
	if(area_id == -1){
		e.reply('没有查询到该地区的天气！',true);
		return true;
	}
	
	var attentionCity = JSON.stringify([{
		province: province,
		city: city,
		district: district,
		isDefault: true
	}]);
	
	let buff = null;
	try{
		const browser = await puppeteer.browserInit();
		const page = await browser.newPage();
		await page.setViewport({
			width: 1280,
			height: 1320
		});
		
		await page.goto('https://tianqi.qq.com/favicon.ico');
		await page.evaluate(`localStorage.setItem('attentionCity', '${attentionCity}')`);//设置默认地区信息
		
		
		await page.goto('https://tianqi.qq.com/');//请求天气页面
		
		await page.evaluate(() => {
			$('#ct-footer').remove();//删除底部导航栏
		});
		
		buff = await page.screenshot({
			fullPage: true,
			type: 'jpeg',
			omitBackground: false,
			quality: 90,
		});
		
		page.close().catch((err) => logger.error(err));
	}catch(err){
		logger.error(err);
	}
	
	if(!buff){
		await e.reply('[小飞插件]天气截图失败！');
		return false;
	}
	
	await e.reply(segment.image(buff));
	
	return true;
}