import plugin from '../../../lib/plugins/plugin.js';
import fetch from 'node-fetch';
import { Config, Version } from '../components/index.js';

// 天气 API 配置
const WEATHER_API = {
    MATCHING: 'https://wis.qq.com/city/matching',
    PAGE: 'https://tianqi.qq.com/',
    PAGE_SOURCE: 'view-source:https://tianqi.qq.com/',
};

// 过滤请求的域名（去除追踪等）
const BLOCKED_DOMAINS = ['trace.qq.com'];

// ==================== 工具函数 ====================

/**
 * 解析输入的地区字符串，分离出省/市/区
 */
function parseAreaSearch(search) {
    const cleaned = search.replace(/\s+/g, ' ').trim();
    const reg = /((.*)省)?((.*)市)?((.*)区)?/;
    const match = reg.exec(cleaned);
    return {
        province: match[2] || '',
        city: match[4] || '',
        district: match[6] || '',
        raw: cleaned,
    };
}

/**
 * 通过腾讯 wis 接口获取地区 area_id
 * @returns {Promise<{areaId: number, province: string, city: string, district: string} | null>}
 */
async function resolveAreaId(search) {
    const { province, city, district, raw } = parseAreaSearch(search);

    // 构建查询候选列表（从细粒度开始尝试）
    const candidates = raw.split(' ').filter(Boolean).reverse();
    candidates.push(raw.replace(/\s/g, ''));

    let areaId = -1;
    let internalData = null;

    // 第一阶段：快速匹配 area_id
    for (const candidate of candidates) {
        const url = `${WEATHER_API.MATCHING}?source=xw&city=${encodeURIComponent(candidate)}`;
        let res;
        try {
            const response = await fetch(url);
            res = await response.json();
        } catch {}

        if (!res || res.status !== 200 || !res.data?.internal || Object.keys(res.data.internal).length === 0) {
            continue;
        }

        const internal = res.data.internal;
        const keys = Object.keys(internal).reverse();

        // 尝试在候选列表中匹配
        for (const key of keys) {
            const name = internal[key];
            for (let i = candidates.indexOf(candidate) + 1; i < candidates.length; i++) {
                if (name.includes(candidates[i]) || candidates[i].includes(name)) {
                    areaId = key;
                    internalData = internal;
                    break;
                }
            }
            if (areaId !== -1) break;
        }
        if (areaId !== -1) break;
    }

    if (areaId === -1) return null;

    // 第二阶段：根据省市区精确筛选
    const keys = Object.keys(internalData).reverse();
    let finalProvince = province;
    let finalCity = city;
    let finalDistrict = district;

    for (const key of keys) {
        const parts = internalData[key].split(', ');
        if (province && !province.includes(parts[0])) continue;
        if (city && !city.includes(parts[1])) continue;
        if (district && !district.includes(parts[2])) continue;

        // 更新最终使用的省市区
        if (parts[0]) finalProvince = parts[0];
        if (parts[1]) finalCity = parts[1];
        if (parts[2]) finalDistrict = parts[2];
        areaId = key;
        break;
    }

    return {
        areaId,
        province: finalProvince,
        city: finalCity,
        district: finalDistrict,
    };
}

/**
 * 使用 puppeteer 获取天气截图
 */
async function captureWeatherScreenshot(areaInfo) {
    const attentionCity = JSON.stringify([{
        province: areaInfo.province,
        city: areaInfo.city,
        district: areaInfo.district,
        isDefault: true,
    }]);

    const puppeteer = xiaofei_plugin.puppeteer;
    const browser = await puppeteer.browserInit();
    const page = await browser.newPage();

    try {
        await page.setViewport({ width: 1280, height: 1320 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
        );

        // 预先访问源码页以设置 localStorage
        await page.goto(WEATHER_API.PAGE_SOURCE);
        await page.evaluate((city) => {
            localStorage.setItem('attentionCity', city);
        }, attentionCity);

        // 设置请求拦截，过滤无关注域名
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (BLOCKED_DOMAINS.some(domain => req.url().includes(domain))) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // 访问实际页面
        await page.goto(WEATHER_API.PAGE, { waitUntil: 'networkidle0' });

        // 移除不需要的元素
        await page.evaluate(() => {
            document.querySelectorAll('a').forEach(el => el.remove());
            const footer = document.getElementById('ct-footer');
            if (footer) footer.remove();
        });

        // 添加版本信息
        await page.evaluate((ver) => {
            const p = document.createElement('p');
            p.style.cssText = 'text-align: center; font-size: 15px; margin-top: -25px;';
            p.textContent = `Created By Yunzai-Bot ${ver.yunzai} & xiaofei-Plugin ${ver.plugin}`;
            document.body.appendChild(p);
        }, { yunzai: Version.yunzai, plugin: Version.ver });

        const body = await page.$('body');
        const img = await body.screenshot({ type: 'jpeg', quality: 100, omitBackground: false });
        return img;
    } finally {
        // 确保页面和浏览器被正确释放
        await page.close().catch(err => logger.error(err));
        puppeteer.renderNum++;
        puppeteer.restart();
    }
}

// ==================== 插件主类 ====================
export class xiaofei_weather extends plugin {
    constructor() {
        super({
            name: '小飞插件_天气',
            dsc: '腾讯天气页面截图，命令格式：#地区天气',
            event: 'message',
            priority: 2000,
            rule: [
                {
                    reg: '^#?(小飞)?(.*)天气$',
                    fnc: 'handleWeather',
                },
            ],
        });

        // 可配置优先级（部分系统设置）
        try {
            const setting = Config.getdefSet('setting', 'system') || {};
            if (setting['weather'] === true) {
                this.priority = 10;
            }
        } catch {}
    }

    async handleWeather() {
        // 忽略小飞设置相关消息
        if (/^#?小飞设置.*$/.test(this.e.msg)) return false;

        const search = this.e.msg
            .replace('#', '')
            .replace('小飞', '')
            .replace('天气', '')
            .trim();

        // 无有效地区名提示
        if (!search || search === '地区') {
            if (this.e.msg.includes('#')) {
                this.e.reply('格式：#地区天气\n例如：#北京天气', true);
            }
            return true;
        }

        // 解析 areaId
        const areaInfo = await resolveAreaId(search);
        if (!areaInfo) {
            if (this.e.msg.includes('#')) {
                this.e.reply('没有查询到该地区的天气！', true);
            }
            return true;
        }

        // 截图
        let imgBuffer;
        try {
            imgBuffer = await captureWeatherScreenshot(areaInfo);
        } catch (err) {
            logger.error('[小飞天气] 截图异常:', err);
            if (this.e.msg.includes('#')) {
                await this.e.reply('[小飞插件]天气截图失败！');
            }
            return false;
        }

        if (!imgBuffer) {
            if (this.e.msg.includes('#')) {
                await this.e.reply('[小飞插件]天气截图失败！');
            }
            return false;
        }

        const img = imgBuffer.type !== 'image' ? segment.image(imgBuffer) : imgBuffer;
        if (img?.file) img.file = Buffer.from(img.file);
        await this.e.reply(img);
        return true;
    }
}