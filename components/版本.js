import fs from 'fs'
let README_path = './plugins/xiaofei-plugin/README.md'
let currentVersion = ''
try{
	if(fs.existsSync(README_path)){
		let README = fs.readFileSync(README_path, 'utf8') || ''
		let reg = /版本：(.*)/.exec(README)
		if(reg){
			currentVersion = reg[1]
		}
	}
}catch(err){
	
}

let Version = {
  get ver () {
    return currentVersion
  }
}
export default Version