import 'dotenv/config';
import convict from 'convict';
import Fs from 'fs-extra';

export const configSchema = {
    GROUP_ID: {
        doc: 'VK Group ID',
        default: 42925056,
        env: 'GROUP_ID',
        arg: 'group-id',
        coerce(val) {
            return parseInt(val, 10);
        },
    },
    SKIP_CAPTCHA: {
        doc: 'Skip accounts with requiered enter captcha',
        env: 'SKIP_CAPTCHA',
        arg: 'skip-captcha',
        default: false,
        format: 'Boolean',
    },
    USE_PROXY: {
        doc: 'Use proxy [Socks5]',
        default: false,
        env: 'USE_PROXY',
        arg: 'proxy',
        format: 'Boolean',
    },
    PROXY_PORT: {
        doc: 'Port proxy',
        format: 'port',
        default: 9050,
        env: 'PROXY_PORT',
        arg: 'proxy-port',
    },
    PROXY_HOST: {
        doc: 'Port host',
        default: 'localhost',
        env: 'PROXY_HOST',
        arg: 'proxy-host',
    },
};

const configPath = './config.json';
export const config = convict(configSchema);

function loadConfig(conv: convict.Config<any>, pathFile: string) {
    if (!Fs.existsSync(pathFile)) {
        console.log(`Created new config file "${pathFile}"`);
        Fs.outputFileSync(pathFile, conv.toString());
    }

    conv.loadFile(pathFile).validate();
}

loadConfig(config, configPath);
