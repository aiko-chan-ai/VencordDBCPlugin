const load = require('./load-typescript.cjs');

module.exports = function gatewayRuntime() {
    const storage = new Map(), channels = new Map(), users = new Map();
    const requests = [], received = [], saved = [], dispatched = [], toasts = [], sent = [], timers = [];
    const info = { success: true, intents: 513, allShards: 3 };
    const native = {
        getBotInfo: async () => info,
        getPrivateChannelDefault: () => ({ id: 'system-dm', recipients: [{ id: 'system-user' }] }),
        getGuildExperiments: () => [], getUserExperiments: () => [[123, 0, 1, -1, 1, 0, 0, 0]],
        getApexExperiments: id => ({ assignments: { '1': { [id]: { assignments: [] } } } }),
    };
    const socket = { send: (op, data) => sent.push({ op, data }) };
    let status, customStatus, emojiLoads = 0;
    const self = {
        settings: { store: { saveDirectMessage: true } }, console: { log() {}, debug() {}, error() {} },
        db: { handleOpenPrivateChannel: (...args) => saved.push(args), queryAllPrivateChannel: async () => [] },
        getApplicationEmojis: () => emojiLoads++,
    };
    const helpers = load('utils/patches.ts', {
        '@webpack': { findStoreLazy: name => name === 'GatewayConnectionStore' ? { getSocket: () => socket }
            : { getRegisteredExperiments: () => ({ user: { type: 'user' }, guild: { type: 'guild' } }) } },
        '@webpack/common': {
            ChannelStore: { getChannel: id => channels.get(id) },
            UserStore: { getCurrentUser: () => ({ id: 'current-bot' }), getUser: id => users.get(id) },
            Constants: { Endpoints: { CHANNEL: id => `/channels/${id}` } },
            FluxDispatcher: { dispatch: event => dispatched.push(event) }, showToast: toast => toasts.push(toast),
            RestAPI: { get: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) },
        },
        './common': { originalSessionStorage: {
            getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)),
        } },
    }, {
        window: { BotClientNative: native }, crypto,
        setTimeout: callback => timers.push(callback),
        Vencord: { Api: { UserSettings: { getUserSetting: (_, key) => ({ getSetting: () => key === 'status' ? status : customStatus }) } } },
    });
    const receive = (data, event, sequence) => received.push({ data, event, sequence });
    return { ...helpers, info, native, self, storage, channels, users, requests, received, saved, dispatched, toasts, sent, timers,
        receive, dispatch: (data, event) => helpers.handleDispatchPatch(data, event, 42, receive, self),
        setPresence: (value, custom) => { status = value; customStatus = custom; }, emojiLoads: () => emojiLoads,
    };
};
