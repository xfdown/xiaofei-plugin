
/**
插件更新地址：https://gitee.com/xfdown/xiaofei-plugin
*/

import fs from 'node:fs'

const files = fs.readdirSync('./plugins/xiaofei-plugin/apps').filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
let ver = '1.1';

logger.info(`---------^_^---------`)
logger.info(`小飞插件${ver}初始化~`)

for (let i in files) {
  let name = files[i].replace('.js', '')
  if (ret[i].status != 'fulfilled') {
    logger.error(`小飞插件${ver}：${logger.red(name)}模块载入失败！`)
    logger.error(ret[i].reason)
    continue
  }
  logger.info(`小飞插件${ver}：${name}模块载入成功！`)
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
logger.info(`小飞插件${ver}初始化完成！`)
logger.info(`---------------------`)
export { apps }