/*
* 此配置文件为系统使用，请勿修改，否则可能无法正常使用
*
* 如需自定义配置请复制修改上一级help_default.js
*
* */

export const helpCfg = {
  title: '小飞帮助',
  subTitle: 'Yunzai-Bot & xiaofei-Plugin',
  columnCount: 3,
  colWidth: 265,
  theme: 'all',
  themeExclude: ['default'],
  style: {
    fontColor: '#ceb78b',
    descColor: '#eee',
    contBgColor: 'rgba(6, 21, 31, .5)',
    contBgBlur: 3,
    headerBgColor: 'rgba(6, 21, 31, .4)',
    rowBgColor1: 'rgba(6, 21, 31, .2)',
    rowBgColor2: 'rgba(6, 21, 31, .35)'
  },
  bgBlur: false
}

export const helpList = [
{
  group: '小飞插件功能',
  list: [{
    icon: 33,
    title: '#点歌 #多选点歌 #小飞点歌',
    desc: '支持使用QQ、网易、酷狗、酷我源点播，例如：#多选酷我点歌周杰伦'
  },{
    icon: 33,
    title: '#语音 #高清语音 #小飞语音',
    desc: '将点播的音乐转为语音发送，请先点播音乐再使用该功能'
  },{
    icon: 33,
    title: '#歌词 #小飞歌词',
    desc: '查询当前点播音乐的歌词，请先点播音乐再使用该功能'
  }{
    icon: 33,
    title: '#QQ个性电台',
    desc: '根据你当前QQ的听歌口味推荐一首歌'
  },{
    icon: 71,
    title: '#天气 #小飞天气',
    desc: '例如：#北京天气 #小飞北京天气'
  },{
    icon: 91,
    title: '#原神注册时间',
    desc: '查询当前绑定ck的原神注册时间'
  }]
},{
  group: '其他查询指令',
  list: [{
    icon: 79,
    title: '#小飞版本 #小飞更新日志',
    desc: '其他命令'
  }]
}, {
  group: '管理命令，仅管理员可用',
  auth: 'master',
  list: [{
    icon: 85,
    title: '#用户ck统计',
    desc: '查询已绑定ck用户的ck使用状态'
  },{
    icon: 85,
    title: '#提交音乐ck',
    desc: '设置点歌ck'
  },{
    icon: 85,
    title: '#音乐ck检查',
    desc: '查询已设置的点歌ck状态'
  },{
    icon: 80,
    title: '#代发言',
    desc: '例如：#代@小飞 抽卡记录'
  },{
    icon: 32,
    title: '#小飞设置',
    desc: '配置小飞功能'
  },{
    icon: 35,
    title: '#小飞更新 #小飞强制更新',
    desc: '更新小飞插件'
  }]
}]

export const isSys = true
