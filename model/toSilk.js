import fs from 'fs';
import os from 'os';
import path from 'path';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { randomUUID } from 'node:crypto';

let getWavFileInfo, isWav, isSilk, encode;
try {
    ({ getWavFileInfo, isWav, isSilk, encode } = await import('silk-wasm'));
} catch (error) {
  logger.warn(`小飞插件提示：未安装最新silk-wasm依赖，可能无法使用语音转换功能，请使用pnpm i命令进行更新依赖(*^_^*)`);
}
const TEMP_DIR = os.tmpdir(); // 将 TEMP_DIR 设置为系统的临时目录

/**
 * 原代码来源：https://github.com/idranme/LLOneBot/blob/main/src/common/utils/audio.ts
 */

async function encodeSilk(file) {
    let filePath = file;
    // 检查 file 是否为 Buffer 实例或 base64 编码的数据
    if (Buffer.isBuffer(file) || file.startsWith("base64://")) {
        logger.info('处理 base64 编码的数据...');
        const base64Data = file.startsWith("base64://") ? file.substring("base64://".length) : file.toString('base64');
        const tempFilePath = path.join(TEMP_DIR, randomUUID());
        fs.writeFileSync(tempFilePath, base64Data, { encoding: 'base64' });
        filePath = tempFilePath;
    }
    // 如果 filePath 是一个 URL
    else if (typeof filePath === 'string' && (filePath.startsWith('http://') || filePath.startsWith('https://'))) {
        logger.info('从 URL 下载文件...');
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`网络响应错误: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer); // 创建 Buffer 实例
        const tempFilePath = path.join(TEMP_DIR, randomUUID());
        fs.writeFileSync(tempFilePath, buffer);
        filePath = tempFilePath;
    }
    // 如果 filePath 是一个本地文件 URI 或者是一个存在的本地文件路径
    else if (typeof filePath === 'string' && (filePath.startsWith('file://') || fs.existsSync(filePath))) {
        logger.info('处理本地文件...');
        // 移除 file:// 前缀
        filePath = filePath.replace(/^file:\/\/\//, '');
        // Windows 系统可能需要移除前导斜杠
        if (os.platform() === 'win32' && filePath.startsWith('/')) {
            filePath = filePath.slice(1);
        }
        // 检查文件是否存在
        if (fs.existsSync(filePath)) {
            const tempFilePath = path.join(TEMP_DIR, randomUUID());
            const fileData = fs.readFileSync(filePath);
            fs.writeFileSync(tempFilePath, fileData);
            filePath = tempFilePath;
        } else {
            throw new Error('提供的本地文件路径不存在。');
        }
    }
    // 如果 filePath 不是有效的文件路径
    else {
        throw new Error('提供的路径不是有效的文件、URL 或 base64 数据。');
    }

    // 获取文件头部信息
    function getFileHeader(filePath) {
        const bytesToRead = 7;
        try {
            const buffer = fs.readFileSync(filePath, {
                encoding: null,
                flag: 'r',
            });
            return buffer.subarray(0, bytesToRead);
        } catch (err) {
            logger.error('读取文件出错:', err);
            return null;
        }
    }

    // 判断是否为 WAV 文件
    async function isWavFile(filePath) {
        return isWav(fs.readFileSync(filePath));
    }

    // 转换函数
    const convert = async () => {
        const pcmPath = `${TEMP_DIR}/${randomUUID()}.pcm`;
        const ffmpegPath = Bot?.config?.ffmpeg_path || process.env.FFMPEG_PATH || 'ffmpeg'; // 使用环境变量中的 FFmpeg 路径或默认值
        const cp = spawn(ffmpegPath, ['-y', '-i', filePath, '-ar', '24000', '-ac', '1', '-f', 's16le', pcmPath]);

        return new Promise((resolve, reject) => {
            cp.on('error', (err) => {
                logger.info('FFmpeg 转换错误:', err.message);
                fs.unlinkSync(pcmPath);
                reject(err);
            });
            cp.on('exit', (code, signal) => {
                const EXIT_CODES = [0, 255];
                if (code == null || EXIT_CODES.includes(code)) {
                    const data = fs.readFileSync(pcmPath);
                    fs.unlinkSync(pcmPath);
                    resolve(data);
                } else {
                    logger.info(`FFmpeg 退出: 代码=${code ?? '未知'} 信号=${signal ?? '未知'}`);
                    fs.unlinkSync(pcmPath);
                    reject(new Error('FFmpeg 转换失败'));
                }
            });
        });
    };

    try {
        let input;
        let sampleRate = 24000; // 默认采样率
        if (!isSilk(getFileHeader(filePath))) {
            logger.info(`音频文件 ${filePath} 需要转换成 silk 格式`);
            const _isWav = await isWavFile(filePath);
            if (!_isWav) {
                input = await convert();
            } else {
                input = fs.readFileSync(filePath);
                const { fmt } = getWavFileInfo(input);
                const allowSampleRate = [8000, 12000, 16000, 24000, 32000, 44100, 48000];
                if (!allowSampleRate.includes(fmt.sampleRate)) {
                    input = await convert();
                } else {
                    sampleRate = fmt.sampleRate; // 使用 WAV 文件的原始采样率
                }
            }

            const silkData = await encode(input, sampleRate);
            return Buffer.from(silkData.data);
        } else {
            logger.info(`文件 ${filePath} 已经是 silk 格式，无需转换。`);
            const silkBuffer = fs.readFileSync(filePath);
            return silkBuffer;
        }
    } catch (error) {
        logger.error('silk 转换失败(可能没有装silk-wasm依赖或者没有FFmpeg): ', error);
    } finally {
        fs.unlinkSync(filePath); // 删除临时文件
    }
}

export default encodeSilk