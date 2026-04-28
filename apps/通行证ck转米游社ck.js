import fetch from 'node-fetch';
import lodash from 'lodash';

// ==================== 动态加载账号管理模块 ====================
let accountManager;
try {
    accountManager = await import('../../genshin/model/gsCfg.js');
} catch {
    accountManager = await import('../../genshin/model/gsCfg');
}

// ==================== 常量配置 ====================
const API_LIST = {
    CN: 'https://api-takumi.mihoyo.com',
    Global: 'https://api-os-takumi.mihoyo.com',
};

const WEB_API_LIST = {
    CN: 'https://webapi.account.mihoyo.com',
    Global: 'https://webapi-os.account.hoyoverse.com',
};

const SERVER_NAMES = {
    0: '米哈游',
    1: 'HoYoverse',
};

// ==================== 通用工具 ====================
/**
 * 将 cookie 字符串解析为 Map 对象
 */
function parseCookieToMap(cookieStr) {
    const map = new Map();
    if (!cookieStr) return map;
    cookieStr
        .replace(/\s/g, '')
        .split(';')
        .forEach(item => {
            const [key, ...val] = item.split('=');
            if (key) map.set(key, val.join('='));
        });
    return map;
}

/**
 * 检测文本中是否包含通行证 Cookie（仅含 login_ticket，不含 cookie_token）
 */
function isPassportCookie(text) {
    return text.includes('login_ticket=') && !text.includes('cookie_token=') && !text.includes('cookie_token_v2=');
}

// ==================== 数据获取函数 ====================
/**
 * 获取当前用户所有已绑定的 Cookie 记录
 */
async function getAllBoundCookies(userId) {
    try {
        const cks = accountManager.getBingCkSingle(userId);
        if (lodash.isEmpty(cks)) {
            return { code: -2, msg: '请先绑定Cookie！\r\n发送【ck帮助】查看配置教程' };
        }
        const list = Object.values(cks).filter(ck => !lodash.isEmpty(ck));
        if (list.length === 0) {
            return { code: -1, msg: '获取Cookie失败！' };
        }
        return { code: 1, msg: '获取成功！', data: list };
    } catch (err) {
        return { code: -1, msg: `读取绑定信息异常: ${err.message}` };
    }
}

/**
 * 通过 login_ticket 获取多 token（stoken、ltoken 等）
 */
async function fetchMultiToken(apiBase, loginTicket, loginUid) {
    const url = `${apiBase}/auth/api/getMultiTokenByLoginTicket?login_ticket=${loginTicket}&token_types=3&uid=${loginUid}`;
    try {
        const response = await fetch(url);
        const res = await response.json();
        if (res?.retcode === 0 && res?.data?.list) {
            const tokenMap = {};
            const cookiePairs = [];
            for (const { name, token } of res.data.list) {
                tokenMap[name] = token;
                cookiePairs.push(`${name}=${token}`);
            }
            tokenMap.stuid = loginUid;
            cookiePairs.push(`stuid=${loginUid}`);
            return { code: 1, data: { tokens: tokenMap, cookies: cookiePairs.join('; ') } };
        }
        return { code: -1, msg: res?.message || '获取stoken失败' };
    } catch (err) {
        return { code: -1, msg: `网络请求异常: ${err.message}` };
    }
}

/**
 * 探测 login_ticket 所属服务器，返回 API 基础地址和 account_id
 */
async function detectServer(loginTicket) {
    const webApis = [WEB_API_LIST.CN, WEB_API_LIST.Global];
    for (let i = 0; i < webApis.length; i++) {
        try {
            const url = `${webApis[i]}/Api/login_by_cookie?t=${Date.now()}`;
            const response = await fetch(url, {
                headers: { Cookie: `login_ticket=${loginTicket};` },
            });
            const res = await response.json();
            if (res?.code === 200 && res.data?.status === 1) {
                return {
                    apiIndex: i,
                    apiBase: i === 0 ? API_LIST.CN : API_LIST.Global,
                    webApi: webApis[i],
                    accountId: res.data.account_info?.account_id || 0,
                    serverName: SERVER_NAMES[i],
                };
            }
        } catch (_) { /* 尝试下一个 */ }
    }
    return { apiIndex: -1, apiBase: '', webApi: '', accountId: 0, serverName: '' };
}

/**
 * 使用 stoken 换取 cookie_token
 */
async function exchangeCookieToken(apiBase, apiIndex, stoken, stuid) {
    const gameBiz = apiIndex === 0 ? 'hk4e_cn' : 'hk4e_global';
    const url = `${apiBase}/auth/api/getCookieAccountInfoBySToken?game_biz=${gameBiz}&stoken=${stoken}&uid=${stuid}`;
    const options = apiIndex === 0 ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: JSON.stringify({ game_biz: gameBiz, stoken, uid: stuid }),
    };
    try {
        const response = await fetch(url, options);
        const res = await response.json();
        if (res?.retcode === 0 && res?.data) {
            return res.data.cookie_token;
        }
        return null;
    } catch (_) {
        return null;
    }
}

// ==================== 插件主类 ====================
export class xiaofei_mysck extends plugin {
    constructor() {
        super({
            name: '小飞插件_通行证ck转米游社ck',
            dsc: '使用米哈游通行证ck登录米游社并自动绑定',
            event: 'message',
            priority: -1,
            rule: [
                {
                    reg: '^#?获取stoken$',
                    fnc: 'handleGetStoken',
                },
            ],
        });
    }

    /**
     * 所有消息的入口（用于自动识别通行证 Cookie）
     */
    async accept() {
        if (!this.e.msg) return false;
        await this.detectAndLoginByPassport();
        return false;
    }

    /**
     * 处理 "#获取stoken" 命令
     */
    async handleGetStoken() {
        if (this.e.isGroup) {
            this.e.reply('请私聊发送该指令！', false, { at: true });
            return true;
        }

        const botInfo = { nickname: Bot.nickname, user_id: Bot.uin };
        const result = await getAllBoundCookies(this.e.user_id);
        if (result.code !== 1) {
            await this.e.reply(result.msg);
            return true;
        }

        const messages = [];
        for (const ck of result.data) {
            if (!ck.uid) continue;
            let cookieText;
            if (ck.login_ticket) {
                const serverInfo = await detectServer(ck.login_ticket);
                if (serverInfo.apiIndex < 0) {
                    cookieText = '获取stoken失败，login_ticket已失效！';
                } else {
                    const tokenRes = await fetchMultiToken(serverInfo.apiBase, ck.login_ticket, String(serverInfo.accountId));
                    cookieText = tokenRes.code === 1 ? tokenRes.data.cookies : '获取stoken失败！';
                }
            } else {
                cookieText = '获取stoken失败，没有找到login_ticket！';
            }
            messages.push({
                ...botInfo,
                message: `uid：${ck.uid}\ncookie：${cookieText}`,
            });
        }

        if (messages.length > 0) {
            const forwardMsg = await Bot.makeForwardMsg(messages);
            await this.e.reply(forwardMsg);
        } else {
            await this.e.reply('未找到可导出stoken的账号');
        }
        return true;
    }

    /**
     * 检测并处理消息中的通行证 Cookie（自动绑定）
     */
    async detectAndLoginByPassport() {
        if (!isPassportCookie(this.e.msg)) return;

        if (this.e.isGroup) {
            this.e.reply('请私聊发送cookie', false, { at: true });
            this.e.msg = '';
            return;
        }

        const cleanMsg = this.e.msg.replace(/'/g, '').replace(/"/g, '');
        const cookieMap = parseCookieToMap(cleanMsg);
        const loginTicket = cookieMap.get('login_ticket');
        const loginUid = cookieMap.get('login_uid');

        if (!loginTicket) {
            this.e.reply('[通行证]Cookie参数不完整！login_ticket参数不存在!', false);
            return;
        }

        // 1. 探测服务器
        const serverInfo = await detectServer(loginTicket);
        if (serverInfo.apiIndex < 0) {
            this.e.reply('[通行证]Cookie已失效，请重新获取！', false);
            return;
        }

        // 2. 获取 stoken 等凭证
        const finalLoginUid = loginUid || String(serverInfo.accountId);
        const tokenRes = await fetchMultiToken(serverInfo.apiBase, loginTicket, finalLoginUid);
        if (tokenRes.code !== 1) {
            this.e.reply(`[${serverInfo.serverName}通行证]获取stoken失败，请重试！`, false);
            return;
        }

        const stokenCookies = tokenRes.data.cookies;
        const tokenMap = parseCookieToMap(stokenCookies);
        const stoken = tokenMap.get('stoken');
        const stuid = tokenMap.get('stuid');

        // 3. 换取 cookie_token
        const cookieToken = await exchangeCookieToken(serverInfo.apiBase, serverInfo.apiIndex, stoken, stuid);
        if (!cookieToken) {
            this.e.reply(`[${serverInfo.serverName}通行证]获取cookie_token失败，请重试！`, false);
            return;
        }

        // 4. 组装完整的米游社 Cookie，并触发框架的绑定流程
        const finalCookie = [
            `ltoken=${tokenMap.get('ltoken')}`,
            `ltuid=${stuid}`,
            `cookie_token=${cookieToken}`,
            `account_id=${stuid}`,
            `login_ticket=${loginTicket}`,
            `login_uid=${finalLoginUid}`,
        ].join('; ');

        await this.e.reply(`[${serverInfo.serverName}通行证]获取cookie_token成功，下面开始执行官方绑定过程。。。`, false);

        this.e.msg = finalCookie;
        this.e.raw_message = finalCookie;
    }
}