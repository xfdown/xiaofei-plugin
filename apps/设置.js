import plugin from '../../../lib/plugins/plugin.js';
import lodash from 'lodash';
import { Config, Common } from '../components/index.js';
import loader from '../../../lib/plugins/loader.js';

// ==================== 常量与配置映射 ====================

/** 设置项中文名 -> 配置路径 */
const SETTING_ITEMS = {
    '点歌': 'system.music',
    '多选点歌': 'system.is_list',
    '天气': 'system.weather',
    '默认音乐源': 'system.music_source',
    '戳一戳': 'system.poke',
    '高品质点歌': 'system.music_high_quality',
    '卡片天气': 'system.card_weather',
};

/** 可选的音乐源 */
const MUSIC_SOURCES = ['QQ', '网易', '酷我', '酷狗'];

/** 生成命令正则：匹配 #小飞设置 点歌 开启 等 */
const SETTING_REGEX = new RegExp(
    `^#?小飞(插件)?设置\\s*(${Object.keys(SETTING_ITEMS).join('|')})?\\s*(.*)$`
);

// ==================== 配置读写工具 ====================

/**
 * 保存配置项
 * @param {string} configPath 如 'system.music'
 * @param {*} value 值
 */
function saveSetting(configPath, value) {
    const [type, name] = configPath.split('.');
    const data = Config.getYaml('setting', type, 'defSet') || {};
    data[name] = value;
    Config.save('setting', type, 'defSet', data);
}

/**
 * 获取配置项的显示 HTML 片段
 * @param {string} configPath 配置路径
 * @returns {string}
 */
function renderSettingStatus(configPath) {
    const [type, name] = configPath.split('.');
    const data = Config.getYaml('setting', type, 'defSet') || {};
    let value = data[name];
    let cssClass = 'cfg-status';

    if (typeof value === 'boolean') {
        if (value) {
            value = '已开启';
        } else {
            cssClass += ' status-off';
            value = '已关闭';
        }
    } else if (!value) {
        // 默认值处理
        if (configPath === 'system.music_source') {
            value = 'QQ';
        } else {
            cssClass += ' status-off';
            value = '已关闭';
        }
    }

    return `<div class="${cssClass}">${value}</div>`;
}

/**
 * 动态重载点歌插件（更新其优先级）
 */
async function reloadMusicPlugin() {
    try {
        // 使用时间戳避免模块缓存
        const musicModule = await import(`./点歌.js?${Date.now()}`);
        // 遍历导出的插件类，更新 loader 中已注册的点歌插件
        lodash.forEach(musicModule, (PluginClass) => {
            const instance = new PluginClass();
            for (const entry of loader.priority) {
                if (entry.key === 'xiaofei-plugin' && entry.name === '小飞插件_点歌') {
                    entry.class = PluginClass;
                    entry.priority = instance.priority;
                }
            }
        });
        // 重新按优先级排序
        loader.priority = lodash.orderBy(loader.priority, ['priority'], ['asc']);
    } catch (err) {
        logger.error('[小飞设置] 重载点歌插件失败:', err);
    }
}

// ==================== 主逻辑 ====================

/**
 * 处理设置命令
 */
async function handleSetting(e) {
    const match = SETTING_REGEX.exec(e.msg);
    if (!match) return false;

    const [, , itemName, rawValue] = match;
    let valueToSave = rawValue || '';
    let configPath = itemName ? SETTING_ITEMS[itemName] : '';

    // 特殊处理：音乐源需要验证
    if (configPath === 'system.music_source') {
        if (!MUSIC_SOURCES.includes(valueToSave)) {
            e.reply('不支持的音乐源！', true);
            return true;
        }
    } else if (valueToSave.includes('开启') || valueToSave.includes('关闭')) {
        // 处理开启/关闭，转换为布尔值
        valueToSave = !valueToSave.includes('关闭');
    } else {
        configPath = '';
    }

    // 执行配置修改
    if (configPath) {
        saveSetting(configPath, valueToSave);
        // 点歌插件需要即时生效
        if (configPath === 'system.music') {
            await reloadMusicPlugin();
        }
    }

    // 收集所有设置项状态用于渲染
    const renderData = {};
    for (const [itemName, path] of Object.entries(SETTING_ITEMS)) {
        const key = path.split('.')[1]; // 如 'music'
        renderData[key] = renderSettingStatus(path);
    }

    // 渲染设置面板图片
    return await Common.render('admin/index', renderData, { e, scale: 1 });
}

// ==================== 插件定义 ====================
export class xiaofei_setting extends plugin {
    constructor() {
        super({
            name: '小飞插件_设置',
            dsc: '',
            event: 'message',
            priority: 2000,
            rule: [
                {
                    reg: SETTING_REGEX,
                    fnc: 'onMessage',
                    permission: 'master',
                },
            ],
        });
    }

    async onMessage() {
        return await handleSetting(this.e);
    }
}