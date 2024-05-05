
/**
插件更新地址：https://gitee.com/xfdown/xiaofei-plugin
*/
import YAML from 'yaml';
import fs from 'node:fs';
import { Version, Plugin_Path } from './components/index.js';

const apps = {};
global.xiaofei_plugin = {
  apps: apps,
  puppeteer: null
};

let is_icqq = false;
let is_oicq = false;

const __dirname = process.cwd().replace(/\\/g, '/') + '/plugins/ICQQ-Plugin'

try {
  let icqq = await import("icqq");
  if (icqq) is_icqq = true;
} catch (err) {
  try {
    let oicq = await import("oicq");
    if (oicq) is_oicq = true;
  } catch (err) { }
}

if (is_icqq || is_oicq) {
  if (!global.core) {
    if (Version.isTrss) {
      const dirs = ["Model", "node_modules"].map(i => `${__dirname}/${i}/icqq/`).filter(fs.existsSync);
      for (const dir of dirs) {
        try {
          const { core } = (await import(`file://${dir}lib/index.js`)).default;
          global.core = core;
          break;
        } catch (err) {
          logger.info(err);
        }
      }
    } else {
      global.core = (await import(is_icqq ? 'icqq' : 'oicq')).core;
    }
  }
  if (!global.segment) global.segment = (await import(is_icqq ? 'icqq' : 'oicq')).segment;
  global.uploadRecord = (await import("./model/uploadRecord.js")).default;
} else {
  global.uploadRecord = segment.record;
}

if (fs.existsSync("./renderers/puppeteer/lib/puppeteer.js")) {
  try {
    let configFile = `./renderers/puppeteer/config.yaml`;
    let rendererCfg = {};
    if (!fs.existsSync(configFile)) {
      configFile = `./renderers/puppeteer/config_default.yaml`;
    }

    try {
      rendererCfg = YAML.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
      rendererCfg = {};
    }

    let puppeteer = new (await import("../../renderers/puppeteer/lib/puppeteer.js")).default(rendererCfg);
    xiaofei_plugin.puppeteer = puppeteer;
  } catch (e) { }
}

if (!xiaofei_plugin.puppeteer) {
  try {
    let puppeteer = (await import("../../lib/puppeteer/puppeteer.js")).default;
    xiaofei_plugin.puppeteer = puppeteer;
  } catch (err) {
    xiaofei_plugin.puppeteer = {};
  }
}

const files = fs.readdirSync(`${Plugin_Path}/apps`).filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)
let ver = Version.ver;

logger.info(`---------^_^---------`)
logger.info(`小飞插件${ver}：初始化~`)

if (Version.yunzai[0] != '3') {
  logger.error(`小飞插件${ver}：初始化失败，本插件仅支持Yunzai-Bot v3！`)
} else {
  for (let i in files) {
    let name = files[i].replace('.js', '')
    if (ret[i].status != 'fulfilled') {
      logger.error(`【${logger.red(name)}】模块载入失败！`)
      logger.error(ret[i].reason)
      continue
    }
    logger.info(`【${name}】模块载入成功！`)
    apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
  }
  logger.info(`小飞插件${ver}：初始化完成！`)
}
logger.info(`---------------------`)
export { apps }