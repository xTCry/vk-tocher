import { VK, CallbackService } from 'vk-io';
import { DirectAuthorization } from '@vk-io/authorization';
import Agent from 'socks5-https-client/lib/Agent';

import ora from 'ora';
import gradient from 'gradient-string';
import colors from 'colors/safe';
import _package from '../package.json';
import { log } from './logger';
import { initPaths, pushToFile, readFile, setTitle, sleep, testProxyAgent } from './tools';
import Readline from './readline';
import { config } from './config';

const spinnerFile = ora();
const spinnerTokens = ora({ spinner: 'moon' });

const useProxy = config.get('USE_PROXY');
const skipCaptcha = config.get('SKIP_CAPTCHA');
const ownerId = config.get('GROUP_ID');

const appName = `[${_package.version}] VK Tokens checker`;

setTitle(appName);

start().then();

enum oraColor {
    black = 'black',
    red = 'red',
    green = 'green',
    yellow = 'yellow',
    blue = 'blue',
    magenta = 'magenta',
    cyan = 'cyan',
    white = 'white',
    gray = 'gray',
}

async function start() {
    console.log(gradient.rainbow(appName));

    await initPaths(['./data/', './data/saved/']);

    let agent;
    if (useProxy) {
        agent = new Agent({ socksPort: 9050, socksHost: '127.0.0.1' });
        try {
            let agentIp = await testProxyAgent(agent);
            log.debug('[Proxy] agentIp', agentIp);
        } catch (error) {
            log.error('[Proxy] Error', error.message);
            // return;
            agent = undefined;
            await Readline.question('Press Enter to run without proxy...');
        }
    }

    let accountsData = await loadLogins({ autoSave: true, agent });

    console.log('accountsData', accountsData);

    console.log('\n' + '*'.repeat(30));
    console.log('\tUsers loaded: ' + accountsData.length);

    await Readline.question('Press Enter to exit...');
    process.exit();

    return accountsData;
}

async function loadLogins({
    fileName = 'logins.txt',
    filePrefix = '',
    autoSave = false,
    agent,
}: { fileName?: string; filePrefix?: string | number; autoSave?: boolean; agent?: Agent } = {}) {
    const pathToUserSave = `saved/users.${filePrefix ? `${filePrefix}.` : ''}${Date.now()}.txt`;
    const pathToEmbedSave = `saved/embed.${filePrefix ? `${filePrefix}.` : ''}${Date.now()}.txt`;

    const usersDataContent = await readFile(fileName);
    if (!usersDataContent) {
        log.error(`Not found file ./data/${fileName}`);
        return [];
    }
    spinnerFile.start('Reading logins from file');

    const usersData = usersDataContent
        .split('\n')
        .filter((e) => e && e.length > 0)
        .map((e) => e.replace(/\r?\n|\r/g, '').split(':'))
        .filter((e) => e.length > 1)
        .map((e) => {
            const [login, password, token] = e;
            return { login, password, token };
        });

    spinnerFile.succeed('Users loaded: ' + usersData.length);

    if (!usersData.length) {
        log.error(`Empty users data from ./data/${fileName}`);
        return [];
    }

    await sleep(200);

    let text = '';
    let color = oraColor.gray;

    spinnerTokens.start('Check tokens');

    let alives = 0;
    let rips = 0;
    const spaceLength = usersData.length.toString().length;

    let readUsers: { login: string; password: string; token: string; userId: number }[] = [];

    let i = 0;
    for (const user of usersData) {
        try {
            let userDataObj = await getUserData(user, agent);

            // ! Опасная зона!
            // Если не удалось получить embed ссылку методом, то происходит переавторизация по ЛоигинуПаролю
            if (true) {
                try {
                    const embed = await getMyURL(userDataObj.token, ownerId);
                    await pushToFile(pathToEmbedSave, embed);
                } catch (e) {
                    if (e.code && e.code === 3) {
                        // Retry get new andoird token
                        delete user.token;
                        userDataObj = await getUserData(user, agent);
                    }

                    try {
                        const embed = await getMyURL(userDataObj.token, ownerId);
                        await pushToFile(pathToEmbedSave, embed);
                    } catch (e) {
                        console.log('**\n');
                        log.warn(e);
                        console.log('***\n');
                        text += ' Fail extract embed.';
                        color = oraColor.gray;
                    }
                }
            }

            text = `@id${userDataObj.userId.toString().padEnd(9, ' ')} => ${userDataObj.first_name} ${
                userDataObj.last_name
            }`;
            color = oraColor.green;
            alives++;

            if (autoSave) {
                let formatData = `${userDataObj.userId}::${userDataObj.login}::${userDataObj.password}::${userDataObj.token}`;
                await pushToFile(pathToUserSave, formatData);
            }
            readUsers.push(userDataObj);
        } catch (error) {
            text = `@ ${user.login} => Token RIP by "${error.message}"`;
            color = oraColor.red;
            rips++;

            if (error.message !== 'SKIP_THIS') {
                if (error.code) {
                    text = `@ ${user.login} => Token RIP by ${error.code} "${error.message}"`;
                } else {
                    log.error(error.message, error.code);
                }
            }
        }

        spinnerTokens.color = color;
        spinnerTokens.text = text;
        spinnerTokens.prefixText =
            gradient.vice('[ ' + ((((i * 100) / usersData.length) | 0) + 1).toString().padStart(3, '0') + '% ]') +
            ' (' +
            colors.red(rips.toString().padStart(spaceLength, '0')) +
            ':' +
            colors.green(alives.toString().padStart(spaceLength, '0')) +
            ')';

        ++i;
        await sleep(200);
    }

    spinnerTokens.succeed(`Extracted ${readUsers.length} users`);
    return readUsers;
}

async function getUserData(user: {
    login: string;
    password: string;
    token?: string;
}, agent?: Agent) {
    let userDataObj = {
        userId: null,
        token: user.token,
        login: user.login,
        password: user.password,
        first_name: null,
        last_name: null,
    };

    if (user.token) {
        const vk = new VK({ token: user.token, agent });
        const [userData] = await vk.api.users.get({});

        userDataObj.userId = userData.id;
        userDataObj.first_name = userData.first_name;
        userDataObj.last_name = userData.last_name;
    } else {
        const newUser = await loginVK(user.login, user.password, agent);

        userDataObj = {
            userId: newUser.user,
            token: newUser.token,
            login: user.login,
            password: user.password,
            first_name: 'null',
            last_name: 'null',
        };
    }
    return userDataObj;
}

async function loginVK(login: string, password: string, agent?: Agent) {
    const callbackService = new CallbackService();
    const direct = new DirectAuthorization({
        agent,
        callbackService,
        apiVersion: '5.101',

        // Android VK
        clientId: '2274003',
        clientSecret: 'hHbZxrka2uZ6jB1inYsH',

        scope: 'all',

        login,
        password,
    });

    callbackService.onCaptcha(async ({ src, type }, retry) => {
        await sleep(10);

        if (skipCaptcha) {
            // return retry(new Error('SKIP_THIS')).then().catch();
            try {
                await retry(new Error('SKIP_THIS'));
            } catch (error) {}
            return;
        }
        do {
            const code = await Readline.question(`Введи капчу (or x) [${src}] by ${login}: `);
            if (!code) {
                continue;
            }

            try {
                await retry(code === 'x' ? new Error('SKIP_THIS') : code);
                log.info.green('Успешно');
            } catch (e) {
                if (e.message !== 'SKIP_THIS') {
                    log.error('[Captcha] Error', e.message);
                }
            }
            break;
        } while (true);
    });
    callbackService.onTwoFactor(async (none, retry) => {
        await sleep(10);

        if (skipCaptcha) {
            // return retry(new Error('SKIP_THIS')).then().catch();
            try {
                await retry(new Error('SKIP_THIS'));
            } catch (error) {}
            return;
        }

        do {
            const code = await Readline.question(`Введи 2FA код (or x) by ${login}: `);
            if (!code) {
                continue;
            }

            try {
                await retry(code === 'x' ? new Error('SKIP_THIS') : code);
                log.info.green('Успешно');
            } catch (e) {
                if (e.message !== 'SKIP_THIS') {
                    log.error('[Captcha] Error', e.message);
                }
            }
            break;
        } while (true);
    });

    let isSpinnerTokens = spinnerTokens.isSpinning;
    if (isSpinnerTokens) {
        spinnerTokens.stop();
    }

    try {
        return await direct.run();
    } finally {
        if (isSpinnerTokens) {
            spinnerTokens.start(/* 'Next...' */);
        }
    }
}


/**
 * Получение embedURL по токену
 */
async function getMyURL(token: string, owner_id?: number): Promise<string> {
    const vk = new VK({ token });

    if (owner_id > 0) {
        owner_id = -owner_id;
    }

    try {
        let ret = await vk.api.call('execute.getServiceApp', {
            app_id: 7148888,
            owner_id,
            v: '5.97',
        });

        if (!ret.response.app || !ret.response.app.view_url) {
            throw new Error('Не удалось получить ссылку. #1');
        }

        return ret.response.app.view_url;
    } catch (error) {
        throw error;
    }
}
