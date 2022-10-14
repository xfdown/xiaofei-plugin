import { core } from "oicq"

async function ArkSign(json){
	return new Promise((resolve, reject) => {
		let result = {code: -1};
		let json_data = null;
		try{
			json_data = JSON.parse(json);
		}catch(err){}
		
		if(!json_data){
			result.code = -1;
			result.msg = '签名失败，不是有效的json！';
			resolve(result);
			return;
		}
		delete json_data['extra'];
		
		let appid = 100951776, style = 10, appname = 'tv.danmaku.bili', appsign = '7194d531cbe7960a22007b9f6bdaa38b';
		let send_type = 0, recv_uin = Bot.uin, recv_guild_id = 0;
		
		let time = new Date().getTime();
		let msg_seq = BigInt(`${time}${random(100,999)}`);
		
		let body = {
			1: appid,
			2: 1,
			3: style,
			5: {
				1: 1,
				2: "0.0.0",
				3: appname,
				4: appsign,
			},
			7: {
				15: msg_seq
			},
			10: send_type,
			11: recv_uin,
			18: {
				1: 1109937557,
				2: {
					14: 'pages',
				},
				3: 'url',
				4: 'text',
				5: 'text',
				6: 'text',
				10: JSON.stringify(json_data),
			}
		};
		
		let json_handle = function(e){
			if(Bot.uin == e.user_id && e?.message[0]?.type == 'json'){
				try{
					Bot.recallMsg(e.message_id);
				}catch(err){}
				
				let json_str = e.message[0].data;
				let json = null;
				let extra = null;
				try{
					json = JSON.parse(json_str);
					extra = typeof(json.extra) == 'object' ? json.extra : JSON.parse(json.extra);
				}catch(err){}
				
				if(extra && extra.msg_seq == msg_seq){
					Bot.off('message',json_handle);
					clearTimeout(timer);
					delete json['extra'];
					result.code = 1;
					result.msg = '签名成功！';
					result.data = json;
					resolve(result);
				}
				
			}
		}
		
		let timer = setTimeout(function(){
			Bot.off('message',json_handle);
			result.code = -1;
			result.msg = '签名失败，请稍后再试！';
			resolve(result);
		},3000);
		
		Bot.on('message',json_handle);
		Bot.sendOidb("OidbSvc.0xb77_9", core.pb.encode(body));
	});
}

export default ArkSign

function random(min,max){
	const range  = max - min;
	const random = Math.random();
	const result = min + Math.round(random * range);
	return result;
}