import Fs from 'fs-extra';
import https from 'https';
import url from 'url';
import { Writable as StreamWritable } from 'stream';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function testProxyAgent(agent: https.Agent) {
    let opts: https.RequestOptions = url.parse('https://ipv4.icanhazip.com');
    opts.agent = agent;

    return new Promise((resolve, reject) => {
        const request = https.get(opts, (response) => {
            let data = '';
            response.on('error', reject);
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                resolve(data);
            });
        });
        request.on('error', reject);
    });
}

export function setTitle(title: string) {
    if (process.platform == 'win32') {
        process.title = title;
    } else {
        process.stdout.write('\x1b]2;' + title + '\x1b\x5c');
    }
}

export async function initPaths(paths: string | string[]) {
    if (typeof paths === 'string') {
        paths = [paths];
    }
    for (const path of paths) {
        if (!Fs.existsSync(path)) {
            await Fs.mkdirp(path);
        }
    }
}

export async function pushToFile(file: string, data: any) {
    try {
        await Fs.appendFile(`./data/${file}`, `${data}\n`);
    } catch (e) {
        console.error(e);
    }
}

export async function readFile(file: string) {
    const filePath = `./data/${file}`;
    if (!Fs.existsSync(filePath)) return undefined;
    return (await Fs.readFile(filePath)).toString();
}

export function createBufferStream(stream: StreamWritable, interval: number = 1e3) {
    let buf = [];
    let timer = null;

    // return a minimal "stream"
    return {
        write(chunk: any) {
            if (timer === null) {
                timer = setTimeout(() => {
                    timer = null;
                    stream.write(buf.join(''));
                    buf.length = 0;
                }, interval);
            }

            buf.push(chunk);
        },
    };
}
