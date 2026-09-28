import CryptoJS from 'crypto-js'
import RSAKey from "./rsakey";
import jsbn from 'jsbn'
import axios from 'axios'
import { env } from '../env'
import { serviceUrl } from '../overrides'
import { sessionKey as sessionKeyStore } from '../../stores/session'

const BigInteger = jsbn.BigInteger


export default class Connector {
    // Global variables
    private static sessionKey: string | null = null;
    private static sessionPassword: CryptoJS.lib.WordArray | null = null;

    /** In flight while a handshake is running, null the rest of the time. */
    private static sessionPromise: Promise<void> | null = null;

    // One request at a time: `service3.php` answers result 99 "Service is busy"
    // when it cannot open its socket to the core, which is what a parallel
    // burst gets.
    private static chain: Promise<unknown> = Promise.resolve();

    private static enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = Connector.chain.then(task, task);
        Connector.chain = run.catch(() => undefined);
        return run;
    }

    /**
     * Every call to the core goes through here.
     *
     * One place for the timeout, so a new call site cannot forget it: axios
     * defaults to *no* timeout, and a host that accepts the connection then
     * never answers would leave the request — and whatever UI is awaiting it —
     * pending indefinitely. A timed-out or refused request is rethrown with a
     * message worth showing a user; axios's own is `timeout of 20000ms exceeded`.
     */
    private static post(body: Record<string, unknown>): Promise<{data: any}> {
        return Connector.enqueue(() => Connector.send(body));
    }

    private static async send(body: Record<string, unknown>): Promise<{data: any}> {
        try {
            // Resolved per request, so the login form's Core IP takes effect
            // without a rebuild (dev overrides only; see src/lib/overrides.ts).
            return await axios.post(serviceUrl(), body, {
                timeout: env.requestTimeoutMs,
                headers: {'Content-Type': 'multipart/form-data'},
            });
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                    throw new Error(`The server did not respond within ${env.requestTimeoutMs / 1000}s. Please try again.`);
                }
                if (error.response) {
                    throw new Error(`The server returned ${error.response.status}. Please try again later.`);
                }
                throw new Error('Could not reach the server. Check your connection and try again.');
            }
            throw error;
        }
    }

    /**
     * The negotiated session password.
     *
     * Every caller reaches here only after `getSession()` has resolved, so a
     * null means the handshake was skipped — a bug worth failing loudly on
     * rather than encrypting with `undefined`.
     */
    private static requireSessionPassword(): CryptoJS.lib.WordArray {
        if (!Connector.sessionPassword) throw new Error('No session: getSession() has not completed');
        return Connector.sessionPassword;
    }

    /** The negotiated session key, or null before the handshake completes. */
    public static get currentSessionKey(): string | null {
        return Connector.sessionKey;
    }

    /**
     * The live session in a form that survives serialisation.
     *
     * The session password is a CryptoJS WordArray, which does not survive
     * JSON, so it goes out as hex. Null until the handshake has run.
     */
    public static exportSession(): { key: string; password: string } | null {
        if (!Connector.sessionKey || !Connector.sessionPassword) return null;
        return {
            key: Connector.sessionKey,
            password: (Connector.sessionPassword as any).toString(CryptoJS.enc.Hex),
        };
    }

    /**
     * Adopts a session negotiated before a page reload.
     *
     * The core keeps the login attached to the session key server-side, so a
     * restored pair is a restored login — until the core times it out, which is
     * why callers validate with a real request before trusting it.
     */
    public static adoptSession(key: string, passwordHex: string): void {
        Connector.sessionKey = key as any;
        Connector.sessionPassword = CryptoJS.enc.Hex.parse(passwordHex) as any;
        sessionKeyStore.set(key as any);
    }

    /** Drops the session, so the next call negotiates a fresh one. */
    public static clearSession(): void {
        Connector.sessionKey = null;
        Connector.sessionPassword = null;
        // A handshake still in flight would otherwise be handed to the next
        // caller by `getSession`, quietly reinstating the session this just
        // cleared.
        Connector.sessionPromise = null;
        sessionKeyStore.set(null);
    }

    // Server's public key
    private static rServer: RSAKey;

    // Device's public key
    private static rDevice: RSAKey;

    constructor() {
        if (!localStorage || !sessionStorage) {
            throw new Error("Browser not supported. Please upgrade your browser");
        }

        // Set server's public  key
        if (!Connector.rServer) {
            Connector.rServer = new RSAKey();
            Connector.rServer.setPublic("BB8E71F82ACF2D48010D9E728D9B9512E8D6F024E4CE305462B8D652345A044A59A587590E9BEAC3AE40BC5B0FC5B078E4C9C3B10514D81A2DE37B32590F3CDB4EE7852296D177FF9BB3473E611FD219B96180B77804542C7D569A320FAD9B8EA84A5D5AB8A058693428A35E7E45FBBAAB419B0133B16A8D5FC1989B7FADB5D65D336A94C5FCAC3E29E8AEB71C9037AB154E8A727328A6A02E15499EFD91291D960AC3C22AAF7E8FEC82553CE4547E18304F910D12182B793B00FAC6D322956E75BE921860B0CFD76817DE6B267D5BE75734F9F468573FA20D6869DD821C103EC4F45B14A70F2248194F1E4D6FB736BB58B92F15321D91C2F82867AC06C3C1D7", "10001");
        }

        // Set device's public key
        if (!localStorage.devicekey) { // If first time access the website, generate device key
            Connector.rDevice = new RSAKey();
            Connector.rDevice.generate(2048, "10001"); // 65537, 0x00010001

            // `generate` populates every component or throws, so none of these
            // is null by the time we read them back out.
            const key = Connector.rDevice;
            const hex = (part: { toString(radix: number): string } | null): string => {
                if (!part) throw new Error('Device key generation did not produce a complete key');
                return part.toString(16);
            };

            localStorage['devicekey'] = 1;
            localStorage['devicekey-n'] = hex(key.n);
            localStorage['devicekey-e'] = key.e;
            localStorage['devicekey-d'] = hex(key.d);
            localStorage['devicekey-p'] = hex(key.p);
            localStorage['devicekey-q'] = hex(key.q);
            localStorage['devicekey-dmp1'] = hex(key.dmp1);
            localStorage['devicekey-dmq1'] = hex(key.dmq1);
            localStorage['devicekey-coeff'] = hex(key.coeff);

        } else { // Load public key from localStorage
            Connector.rDevice = new RSAKey();
            Connector.rDevice.setPrivateEx(
                localStorage['devicekey-n'],
                "10001",
                localStorage['devicekey-d'],
                localStorage['devicekey-p'],
                localStorage['devicekey-q'],
                localStorage['devicekey-dmp1'],
                localStorage['devicekey-dmq1'],
                localStorage['devicekey-coeff']
            );
        }

    }

    private genX509(rsakey: RSAKey): string {
        return "30820122300D06092A864886F70D01010105000382010F003082010A0282010100" + rsakey.n?.toString(16) + "0203010001";
    }

    private xorHex(hex1: string, hex2: string): string {
        let res = "";
        for (let i = 0; i < hex1.length; i += 2) {
            let x = parseInt(hex1.substring(i, i + 2), 16) ^ parseInt(hex2.substring(i, i + 2), 16);
            let cx = x.toString(16);
            if (cx.length == 1) cx = "0" + cx;
            res += cx;
        }
        return res;
    }

    /**
     * Negotiates a session key, at most once at a time.
     *
     * Concurrent callers share one handshake. The in-flight promise is cleared
     * in `finally` — **whether it resolved or rejected**. It used to be cleared
     * only on the success path, so a failed handshake left every later caller
     * awaiting a promise that could never succeed, and the only way out was a
     * page reload.
     */
    public async getSession(): Promise<void> {
        // If a session already exists, just return. To force a new one, clear it.
        if (Connector.sessionKey) return;

        if (Connector.sessionPromise) return Connector.sessionPromise;

        const promise = this.negotiateSession().finally(() => {
            Connector.sessionPromise = null;
        });
        Connector.sessionPromise = promise;
        return promise;
    }

    /**
     * The handshake itself.
     *
     * Deliberately a plain `async` method rather than the `new Promise(async
     * resolve => ...)` this replaced. That form silently swallows failures: an
     * async executor that throws returns a rejected promise which `new Promise`
     * discards, so `reject` is never called and the promise never settles. The
     * error surfaced as an unhandled rejection in the console while every
     * awaiting caller — the login form included — waited forever.
     */
    private async negotiateSession(): Promise<void> {
        // Setup session's key
        let requestkey = CryptoJS.lib.WordArray.random(16);
        let sessionck = CryptoJS.lib.WordArray.random(16);

        let iv = CryptoJS.lib.WordArray.random(16);
        let enpk = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse(this.genX509(Connector.rDevice)), requestkey, {"iv": iv});
        let enaesck = Connector.rServer.encryptRaw(new BigInteger(requestkey.toString(CryptoJS.enc.Hex) + sessionck.toString(CryptoJS.enc.Hex), 16));

        const sessionResult = await Connector.post({
            command: "getsession",
            enpk: enpk.ciphertext.toString(CryptoJS.enc.Base64),
            enaesck: CryptoJS.enc.Hex.parse(enaesck).toString(CryptoJS.enc.Base64),
            iv: iv.toString(CryptoJS.enc.Base64),
            version: 1
        });

        const res = sessionResult.data;
        if (res.result !== 0) {
            throw new Error(res.message ?? "BCEL One core returned unknown data during the session handshake");
        }

        // `decrypt` returns null when the payload does not match the key,
        // which would otherwise surface as an unrelated JSON parse error.
        const decrypted = Connector.rDevice.decrypt(CryptoJS.enc.Base64.parse(res.data).toString(CryptoJS.enc.Hex));
        if (!decrypted) throw new Error('Could not decrypt the session response with this device key');
        const decryptedString = CryptoJS.enc.Hex.parse(decrypted).toString(CryptoJS.enc.Utf8);
        let rdata = JSON.parse(decryptedString);

        Connector.sessionKey = rdata.sessionkey;
        // Publish for consumers that report client state to iframes; the
        // session password stays private to this class.
        sessionKeyStore.set(rdata.sessionkey);
        Connector.sessionPassword = CryptoJS.enc.Hex.parse(this.xorHex(sessionck.toString(CryptoJS.enc.Hex), CryptoJS.enc.Base64.parse(rdata.sessionsk).toString(CryptoJS.enc.Hex)));
    }

    /** Dev only: payloads carry account numbers, balances and history. */
    private static log(label: string, ...parts: unknown[]): void {
        if (!import.meta.env.DEV) return;
        console.log(label, ...parts);
    }

    public async sendMessage(service: string, dts: unknown): Promise<any> {
        if (!Connector.sessionKey) {
            await this.getSession();
        }

        Connector.log('SENDING MESSAGE', service, dts);

        let iv = CryptoJS.lib.WordArray.random(16);
        let edts = CryptoJS.AES.encrypt(JSON.stringify(dts), Connector.requireSessionPassword(), {iv: iv});


        const messageResponse = await Connector.post({
            service: service,
            sessionkey: Connector.sessionKey,
            data: edts.ciphertext.toString(CryptoJS.enc.Base64),
            iv: iv.toString(CryptoJS.enc.Base64),
            lang: 1
        });


        let data = messageResponse.data;

        if (typeof data === 'string') {
            let dtext: string

            if (data.startsWith("{")) {
                dtext = data;
            } else {
                let cmsg = CryptoJS.enc.Base64.parse(data.replace(/[\n\r]/gi, ""));
                let iv = cmsg.clone();
                iv.words.splice(4);
                iv.sigBytes = 16;

                cmsg.words.splice(0, 4);
                cmsg.sigBytes -= 16;

                // `CipherParams.create` takes just the fields that matter. The
                // object literal this replaced had to spell out seven
                // `undefined` properties purely to satisfy the compiler.
                dtext = CryptoJS.AES.decrypt(
                    CryptoJS.lib.CipherParams.create({ciphertext: cmsg, iv: iv}),
                    Connector.requireSessionPassword(),
                    {iv: iv}
                ).toString(CryptoJS.enc.Utf8);
            }

            data = JSON.parse(dtext);
        }

        Connector.log('RECEIVED RESPONSE', data);

        return data;
    }
}
