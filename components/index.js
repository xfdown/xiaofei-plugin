import Version from './版本.js'
const Path = process.cwd();
const Plugin_Name = 'xiaofei-plugin'
const Plugin_Path = `${Path}/plugins/${Plugin_Name}`;

import Data from './Data.js'
import Cfg from './Cfg.js'
import Common from './Common.js'

export { Cfg, Common, Data, Version, Path, Plugin_Name, Plugin_Path}